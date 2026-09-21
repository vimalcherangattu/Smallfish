"""Measure open-data coverage against Google (S0-04, gate item 1).

**The gate item cannot be measured the way it is written, and this is the
retraction.** Gate item 1 asks for "open-data coverage >= 70% of Google's count
per niche". Measured 2026-09-21: Google Places Text Search (New) hard-caps at
**60 results** — three pages of 20, then `nextPageToken` stops. Overture returns
3,009 med spas for the same metro. There is no API call that yields "Google's
count", so a count ratio was never obtainable.

That is a good thing, because a count ratio is the wrong measurement anyway.
Overture could return 3,009 businesses, Google could have 3,000, and the two
sets could overlap by half — the ratio would read 100% while we were missing
1,500 businesses a customer would expect to see. What the gate is *for* is
"are we missing businesses our customers would notice?", and that is an
**overlap** question, not a count question.

So this measures overlap on a random sample:

1. Tile the metro's search radius into cells small enough that Google's 60-cap
   does not bite. A cell that returns exactly 60 is flagged as truncated and
   excluded, because we cannot tell what it omitted.
2. Draw a seeded random sample of cells, so the run is reproducible and cheap.
3. For each Google place in a sampled cell, ask whether Overture has it.
4. Report the matched share with a Wilson interval, because a sample of a few
   hundred places has real uncertainty and a bare percentage hides it.

**Google's terms.** Place IDs may be stored indefinitely; other Places content
may not. Names and coordinates are used in memory to do the matching and are
then discarded — what lands on disk is the place ID, whether it matched, and
which Overture id it matched to. Nothing else. See `_Match`.

Usage:
    python3 stage0/src/coverage/google_baseline.py --dry-run     # cost first
    python3 stage0/src/coverage/google_baseline.py --market med-spa-dallas
    python3 stage0/src/coverage/google_baseline.py               # all markets
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import re
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "stage0" / "fixtures" / "benchmarks.json"
DATA = ROOT / "stage0" / "data"

SEARCH_TEXT = "https://places.googleapis.com/v1/places:searchText"
# id is free-tier; location and displayName are what matching needs. Keeping the
# mask this tight matters: the field mask decides the billing SKU.
FIELD_MASK = ("places.id,places.location,places.displayName,"
              "places.primaryType,nextPageToken")

PAGE_SIZE = 20
MAX_PAGES = 3           # measured: the API stops after three pages
CAP = PAGE_SIZE * MAX_PAGES
CELL_HALF_M = 2000.0    # square half-side; small enough that the 60-cap rarely bites
# Per market; the cost knob. 20 rather than 30 so the *worst* case — every cell
# needing all three pages — stays inside the plan's "well under $10" for S0-04.
# At 30 the worst case was $11.52, and a budget that only holds on the expected
# case is not a budget.
SAMPLE_CELLS = 20
SEED = 20260921

# Text Search Pro, US list price per request. Only used for the estimate the
# dry run prints — the authority is the Cloud billing page, not this constant.
PRICE_PER_REQUEST = 0.032

# What a niche looks like to Google: a text query plus the `primaryType` values
# that count as the niche.
#
# The filter is not optional, and the first run proved it. Text search alone,
# in a sparse suburban cell, returned "Solis Mammography", "Regal Nails, Salon
# & Spa" and "Vachale Beauty Concepts" for "med spa" — Google relaxes the query
# when there is nothing better nearby. Scoring Overture against those measures
# our coverage of businesses that are not in the niche at all, which is how a
# first pass got 0%.
#
# Filtering on the *returned* primaryType rather than passing `includedType`
# is deliberate, and also measured: `general_contractor` comes back as a
# primaryType but is rejected as an includedType, as are `medical_spa` and
# `hvac_contractor`. The returned value works for every niche; the request
# parameter does not.
#
# These allow-lists mirror the Overture categories in `benchmarks.json`, and
# they are a judgment that moves the headline number — widen one and coverage
# falls, because Google gains businesses Overture's category filter excluded.
NICHE_QUERY = {
    "med_spa": ("med spa", {"spa", "skin_care_clinic", "beauty_salon"}),
    "dental": ("dentist", {"dentist", "dental_clinic"}),
    "hvac": ("HVAC contractor", {"general_contractor", "plumber", "electrician"}),
    "veterinary": ("veterinary clinic", {"veterinary_care", "animal_hospital"}),
}

# Matching thresholds. Deliberately generous on distance and strict on name:
# a false *match* would inflate coverage, which is the flattering direction and
# therefore the one to guard.
SAME_PLACE_M = 150.0
NAME_SIMILARITY = 0.6


@dataclass
class _Match:
    """What is allowed to reach disk: a place ID and the verdict about it.

    No name, no address, no coordinates. Google's terms permit caching place
    IDs indefinitely and not the rest, so the rest lives only in memory for the
    duration of the comparison.
    """

    place_id: str
    matched: bool
    overture_id: str | None
    # Overture has *a* business at this spot under a name we could not
    # reconcile. Neither a confirmed hit nor a confirmed miss.
    ambiguous: bool = False


@dataclass
class Cell:
    """A rectangular tile.

    Measured the hard way: `searchText` accepts a *rectangle* for
    `locationRestriction` and rejects a circle — circles are only valid on
    `searchNearby`, which in turn does not paginate past 20. Rectangles are the
    better shape anyway: they tile with no overlap and no corner gaps, so
    nothing is double-billed and nothing is silently missed.
    """

    lat: float
    lon: float
    half_m: float

    def bounds(self) -> tuple[float, float, float, float]:
        """(low_lat, low_lon, high_lat, high_lon)."""
        dlat = self.half_m / 111_320.0
        dlon = self.half_m / (111_320.0 * math.cos(math.radians(self.lat)))
        return (self.lat - dlat, self.lon - dlon, self.lat + dlat, self.lon + dlon)


@dataclass
class Stratum:
    """One sampling stratum, and enough to scale it back up to the metro."""

    name: str
    cells_total: int = 0
    cells_sampled: int = 0
    cells_truncated: int = 0
    google_places: int = 0
    matched: int = 0
    ambiguous: int = 0
    off_niche_dropped: int = 0

    @property
    def scale(self) -> float:
        """Cells in the stratum per cell actually sampled."""
        return self.cells_total / self.cells_sampled if self.cells_sampled else 0.0


@dataclass
class MarketResult:
    market: str
    niche: str
    requests: int = 0
    strata: dict = field(default_factory=dict)
    matches: list[_Match] = field(default_factory=list)

    @property
    def google_places(self) -> int:
        return sum(s.google_places for s in self.strata.values())

    @property
    def matched(self) -> int:
        return sum(s.matched for s in self.strata.values())

    @property
    def ambiguous(self) -> int:
        return sum(s.ambiguous for s in self.strata.values())

    @property
    def coverage_generous(self) -> float:
        """Upper bound: every ambiguous pair counted as a hit."""
        num = sum((s.matched + s.ambiguous) * s.scale for s in self.strata.values())
        den = sum(s.google_places * s.scale for s in self.strata.values())
        return num / den if den else 0.0

    @property
    def cells_sampled(self) -> int:
        return sum(s.cells_sampled for s in self.strata.values())

    @property
    def cells_truncated(self) -> int:
        return sum(s.cells_truncated for s in self.strata.values())

    @property
    def off_niche_dropped(self) -> int:
        return sum(s.off_niche_dropped for s in self.strata.values())

    @property
    def coverage(self) -> float:
        """Ratio estimator across strata.

        A plain matched/found would over-weight the dense stratum, where we
        sample a larger share of the cells. Scaling each stratum back to its
        full cell count is what makes this an estimate for the metro rather
        than for the cells that happened to be drawn.
        """
        num = sum(s.matched * s.scale for s in self.strata.values())
        den = sum(s.google_places * s.scale for s in self.strata.values())
        return num / den if den else 0.0


# ---------------------------------------------------------------- geometry

def tile(center: dict, radius_miles: float, half_m: float) -> list[Cell]:
    """Cover the search radius with a grid of abutting square cells.

    Cells are kept when their centre falls inside the radius, which is the same
    disc `overture_extract.py` pulled — so Google and Overture are being asked
    about the same ground.
    """
    radius_m = radius_miles * 1609.344
    step = half_m * 2
    lat0, lon0 = center["lat"], center["lon"]
    m_per_deg_lat = 111_320.0
    m_per_deg_lon = 111_320.0 * math.cos(math.radians(lat0))

    cells: list[Cell] = []
    n = int(radius_m // step) + 1
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            dy, dx = i * step, j * step
            if math.hypot(dx, dy) > radius_m:
                continue
            cells.append(
                Cell(lat0 + dy / m_per_deg_lat, lon0 + dx / m_per_deg_lon, half_m)
            )
    return cells


def metres_between(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    r = 6_371_000.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp = math.radians(b_lat - a_lat)
    dl = math.radians(b_lon - a_lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


# ------------------------------------------------------------------ naming

_NOISE = re.compile(
    r"\b(the|inc|llc|pllc|pc|pa|ltd|co|corp|and|of|at|dr|doctor|clinic|center|centre)\b",
    re.I,
)


def normalise(name: str) -> str:
    n = _NOISE.sub(" ", name.lower())
    return re.sub(r"[^a-z0-9]+", " ", n).strip()


def similarity(a: str, b: str) -> float:
    """Token overlap (Jaccard). Cheap, and good enough for business names once
    the legal-form noise is stripped. Returns 1.0 when either is a subset."""
    ta, tb = set(normalise(a).split()), set(normalise(b).split())
    if not ta or not tb:
        return 0.0
    if ta <= tb or tb <= ta:
        return 1.0
    return len(ta & tb) / len(ta | tb)


# -------------------------------------------------------------------- API

def search_cell(key: str, query: str, cell: Cell) -> tuple[list[dict], int, bool]:
    """All of Google's results for one cell. Returns (places, requests, truncated)."""
    places: list[dict] = []
    token: str | None = None
    requests = 0

    for _ in range(MAX_PAGES):
        lo_lat, lo_lon, hi_lat, hi_lon = cell.bounds()
        body: dict = {
            "textQuery": query,
            "pageSize": PAGE_SIZE,
            "locationRestriction": {
                "rectangle": {
                    "low": {"latitude": lo_lat, "longitude": lo_lon},
                    "high": {"latitude": hi_lat, "longitude": hi_lon},
                }
            },
        }
        if token:
            body["pageToken"] = token
        req = urllib.request.Request(
            SEARCH_TEXT,
            data=json.dumps(body).encode(),
            headers={
                "X-Goog-Api-Key": key,
                "Content-Type": "application/json",
                "X-Goog-FieldMask": FIELD_MASK,
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.load(r)
        except urllib.error.HTTPError as e:
            # Never spend further on a broken run; surface the real message.
            raise SystemExit(f"Google API error {e.code}: {e.read().decode()[:400]}")
        requests += 1
        places.extend(d.get("places", []))
        token = d.get("nextPageToken")
        if not token:
            break
        time.sleep(0.2)

    return places, requests, len(places) >= CAP


# --------------------------------------------------------------- matching

def overture_in_cell(con, parquet: Path, cell: Cell) -> list[tuple[str, str, float, float]]:
    """Overture rows near a cell, as (id, name, lat, lon).

    The cell is padded by the match radius, so a business Overture places just
    outside the rectangle can still match a Google result just inside it.
    Without the pad, a geocoding disagreement of 50 m at a cell edge would read
    as a coverage miss.
    """
    dlat_pad = SAME_PLACE_M / 111_320.0
    dlon_pad = SAME_PLACE_M / (111_320.0 * math.cos(math.radians(cell.lat)))
    lo_lat, lo_lon, hi_lat, hi_lon = cell.bounds()
    return con.execute(
        f"""
        SELECT id, name, lat, lon FROM read_parquet('{parquet}')
        WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
        """,
        [lo_lat - dlat_pad, hi_lat + dlat_pad, lo_lon - dlon_pad, hi_lon + dlon_pad],
    ).fetchall()


def match_one(g_name: str, g_lat: float, g_lon: float,
              candidates) -> tuple[str | None, bool]:
    """(Overture id or None, whether the location is occupied at all).

    Two answers, not one, because the gap between them is large and it is not
    resolvable by string comparison. Measured on 15 Phoenix cells: 57% matched
    on name, 6% had nothing within 150 m, and **34% had an Overture business at
    the same spot under a name the comparison could not reconcile**. Some of
    those are the same practice — "Dr. Anthony R. Valenzuela, DMD" against
    "Tony Valenzuela D.M.D.", 13 m apart, scores 0.10. Others are genuinely
    different dentists sharing a medical building — "Dr. Oksana Stoj, DMD" and
    "Dr. Shannon Coen", 6 m apart.

    Reporting one number would mean guessing which, in the direction of
    whichever answer we preferred. So both bounds are carried: a strict
    coverage that assumes every ambiguous pair is a miss, and a generous one
    that assumes every ambiguous pair is a hit. The truth is between them, and
    settling it needs a model reading both names — which is S0-12's job.
    """
    best, best_score = None, 0.0
    occupied = False
    for oid, oname, olat, olon in candidates:
        d = metres_between(g_lat, g_lon, olat, olon)
        if d > SAME_PLACE_M:
            continue
        occupied = True
        sc = similarity(g_name, oname or "")
        if sc >= NAME_SIMILARITY and sc > best_score:
            best, best_score = oid, sc
    return best, occupied


# ---------------------------------------------------------------- reporting

def wilson(successes: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """95% Wilson interval. A bare percentage from a few hundred samples reads
    as more certain than it is, and this gate is a go/no-go."""
    if n == 0:
        return (0.0, 0.0)
    p = successes / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    m = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return ((c - m) / d, (c + m) / d)


def overture_counts(con, parquet: Path, cells: list[Cell]) -> list[int]:
    """How many Overture rows fall in each cell. Local, free, no API calls."""
    counts = []
    for c in cells:
        lo_lat, lo_lon, hi_lat, hi_lon = c.bounds()
        counts.append(con.execute(
            f"SELECT count(*) FROM read_parquet('{parquet}') "
            f"WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?",
            [lo_lat, hi_lat, lo_lon, hi_lon]).fetchone()[0])
    return counts


def run_market(con, key: str, market: dict, radius_miles: float,
               sample: int, dry_run: bool) -> MarketResult:
    niche = market["niche"]
    spec = NICHE_QUERY.get(niche)
    if not spec:
        raise SystemExit(f"No Google query defined for niche {niche!r}")
    query, allowed_types = spec

    parquet = DATA / f"overture-{market['id']}.parquet"
    if not parquet.exists():
        raise SystemExit(f"Missing {parquet}. Run overture_extract.py first.")

    cells = tile(market["center"], radius_miles, CELL_HALF_M)

    # Two strata. Sampling uniformly over a 25-mile disc spends most of the
    # budget on empty suburbs and returns a handful of businesses; but dropping
    # the empty cells would hide the most important failure — a Google business
    # somewhere Overture has nothing at all. So both are sampled and each is
    # scaled back to its true size.
    counts = overture_counts(con, parquet, cells)
    dense = [c for c, n in zip(cells, counts) if n > 0]
    sparse = [c for c, n in zip(cells, counts) if n == 0]

    result = MarketResult(market=market["id"], niche=niche)
    rng = random.Random(f"{SEED}:{market['id']}")

    # Two thirds of the budget where the businesses are, one third on the
    # blind-spot check.
    plan = [("dense", dense, math.ceil(sample * 2 / 3)),
            ("sparse", sparse, sample // 3)]

    for name, pool, want in plan:
        st = Stratum(name=name, cells_total=len(pool))
        result.strata[name] = st
        if not pool:
            continue
        chosen = rng.sample(pool, min(want, len(pool)))
        if dry_run:
            st.cells_sampled = len(chosen)
            result.requests += len(chosen) * MAX_PAGES
            continue

        seen: set[str] = set()
        for cell in chosen:
            places, reqs, truncated = search_cell(key, query, cell)
            result.requests += reqs
            st.cells_sampled += 1
            if truncated:
                # We cannot know what a saturated cell left out.
                st.cells_truncated += 1
                continue

            candidates = overture_in_cell(con, parquet, cell)
            for p in places:
                pid = p.get("id")
                if not pid or pid in seen:
                    continue
                seen.add(pid)
                if p.get("primaryType") not in allowed_types:
                    # Not this niche. Scoring against it would measure our
                    # coverage of businesses the search was never about.
                    st.off_niche_dropped += 1
                    continue
                name_text = (p.get("displayName") or {}).get("text", "")
                loc = p.get("location") or {}
                oid, occupied = match_one(name_text, loc.get("latitude", 0.0),
                                          loc.get("longitude", 0.0), candidates)
                amb = oid is None and occupied
                result.matches.append(_Match(pid, oid is not None, oid, amb))
                st.google_places += 1
                if oid:
                    st.matched += 1
                elif amb:
                    st.ambiguous += 1

    return result


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--market", help="one market id; default is all")
    ap.add_argument("--cells", type=int, default=SAMPLE_CELLS,
                    help=f"cells sampled per market (default {SAMPLE_CELLS})")
    ap.add_argument("--dry-run", action="store_true",
                    help="print the request count and cost estimate, spend nothing")
    args = ap.parse_args()

    key = os.environ.get("GOOGLE_PLACES_API_KEY")
    if not key and not args.dry_run:
        raise SystemExit("GOOGLE_PLACES_API_KEY not set. Run preflight.py.")

    spec = json.loads(FIXTURES.read_text())
    markets = [m for m in spec["markets"]
               if not args.market or m["id"] == args.market]
    if not markets:
        raise SystemExit(f"No market matching {args.market!r}")

    con = duckdb.connect()
    results = [run_market(con, key or "", m, spec["radius_miles"], args.cells,
                          args.dry_run) for m in markets]

    if args.dry_run:
        total = sum(r.requests for r in results)
        print("Dry run — nothing spent.\n")
        for r in results:
            print(f"  {r.market:18} {r.cells_sampled:>3} cells, "
                  f"up to {r.requests:>4} requests")
        print(f"\n  worst case {total} requests "
              f"≈ ${total * PRICE_PER_REQUEST:.2f} at ${PRICE_PER_REQUEST}/request")
        print("  (most cells need one page, so expect roughly a third of this)")
        print("\n  Price is a list-price estimate; Cloud billing is the authority.")
        return 0

    w = max(len(r.market) for r in results)
    print(f"{'market'.ljust(w)}  cells  off-niche  google  matched  ambig  "
          f"STRICT   GENEROUS")
    for r in results:
        print(f"{r.market.ljust(w)}  {r.cells_sampled:>5}  {r.off_niche_dropped:>9}  "
              f"{r.google_places:>6}  {r.matched:>7}  {r.ambiguous:>5}  "
              f"{100 * r.coverage:>5.1f}%   {100 * r.coverage_generous:>5.1f}%")

    print("\nBy stratum (dense = Overture has businesses here; sparse = it has none):")
    for r in results:
        for name, st in r.strata.items():
            if not st.cells_sampled:
                continue
            print(f"  {r.market:16} {name:7} {st.cells_sampled:>3} of {st.cells_total:>4} cells  "
                  f"{st.google_places:>4} google  {st.matched:>4} matched  "
                  f"{st.ambiguous:>4} ambiguous")

    total_reqs = sum(r.requests for r in results)
    print(f"\nRequests spent: {total_reqs} ~ ${total_reqs * PRICE_PER_REQUEST:.2f} "
          f"(list-price estimate).")

    gate = [r for r in results if r.google_places]
    if gate:
        lo = min(wilson(r.matched, r.google_places)[0] for r in gate)
        hi = max(wilson(r.matched + r.ambiguous, r.google_places)[1] for r in gate)
        print(f"\nGate item 1 needs >= 70% coverage.")
        print(f"  Strict floor, worst market:  {100 * lo:.1f}%  "
              f"(every ambiguous pair a miss)")
        print(f"  Generous ceiling, best:      {100 * hi:.1f}%  "
              f"(every ambiguous pair a hit)")
        strict_pass = all(r.coverage >= 0.70 for r in gate)
        gen_pass = all(r.coverage_generous >= 0.70 for r in gate)
        if strict_pass:
            print("  PASSES even on the strict reading.")
        elif not gen_pass:
            print("  FAILS even on the generous reading — the gap is real, "
                  "not a matching artifact.")
        else:
            print("  UNDECIDED. The answer sits inside the ambiguous band, so the "
                  "gate cannot be\n  settled by string matching. Resolving it needs "
                  "a model to judge whether two\n  names at one address are one "
                  "business — see S0-12.")

    out = DATA / "google-baseline.json"
    out.write_text(json.dumps(
        [
            {
                "market": r.market, "niche": r.niche,
                "cells_sampled": r.cells_sampled, "cells_truncated": r.cells_truncated,
                "off_niche_dropped": r.off_niche_dropped,
                "strata": {n: {"cells_total": st.cells_total,
                               "cells_sampled": st.cells_sampled,
                               "google_places": st.google_places,
                               "matched": st.matched, "ambiguous": st.ambiguous,
                               "off_niche_dropped": st.off_niche_dropped}
                           for n, st in r.strata.items()},
                "requests": r.requests, "google_places": r.google_places,
                "matched": r.matched, "ambiguous": r.ambiguous,
                "coverage_strict": round(r.coverage, 4),
                "coverage_generous": round(r.coverage_generous, 4),
                "ci95_strict": [round(x, 4) for x in wilson(r.matched, r.google_places)],
                # Place IDs and verdicts only — never Google's names or coordinates.
                "places": [{"place_id": m.place_id, "matched": m.matched,
                            "ambiguous": m.ambiguous,
                            "overture_id": m.overture_id} for m in r.matches],
            }
            for r in results
        ], indent=2) + "\n")
    print(f"\n→ {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
