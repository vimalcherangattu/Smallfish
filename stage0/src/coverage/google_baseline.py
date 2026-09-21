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
FIELD_MASK = "places.id,places.location,places.displayName,nextPageToken"

PAGE_SIZE = 20
MAX_PAGES = 3           # measured: the API stops after three pages
CAP = PAGE_SIZE * MAX_PAGES
CELL_RADIUS_M = 2500.0  # small enough that the 60-cap rarely bites
# Per market; the cost knob. 20 rather than 30 so the *worst* case — every cell
# needing all three pages — stays inside the plan's "well under $10" for S0-04.
# At 30 the worst case was $11.52, and a budget that only holds on the expected
# case is not a budget.
SAMPLE_CELLS = 20
SEED = 20260921

# Text Search Pro, US list price per request. Only used for the estimate the
# dry run prints — the authority is the Cloud billing page, not this constant.
PRICE_PER_REQUEST = 0.032

# What a niche looks like to Google. Deliberately a *text* query rather than
# includedTypes: Google's type taxonomy and Overture's do not line up, and a
# text query is what a user would actually type — which is the comparison the
# gate cares about.
NICHE_QUERY = {
    "med_spa": "med spa",
    "dental": "dentist",
    "hvac": "HVAC contractor",
    "veterinary": "veterinary clinic",
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


@dataclass
class Cell:
    lat: float
    lon: float
    radius_m: float


@dataclass
class MarketResult:
    market: str
    niche: str
    cells_sampled: int = 0
    cells_truncated: int = 0
    requests: int = 0
    google_places: int = 0
    matched: int = 0
    matches: list[_Match] = field(default_factory=list)

    @property
    def coverage(self) -> float:
        return self.matched / self.google_places if self.google_places else 0.0


# ---------------------------------------------------------------- geometry

def tile(center: dict, radius_miles: float, cell_radius_m: float) -> list[Cell]:
    """Cover the search radius with overlapping circular cells.

    Spacing is cell_radius * sqrt(2) so the circles overlap and leave no gap at
    the corners of the implied grid. Overlap costs duplicate results, which are
    deduplicated by place ID; a gap would cost a silent miss, which is worse.
    """
    radius_m = radius_miles * 1609.344
    step = cell_radius_m * math.sqrt(2)
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
                Cell(lat0 + dy / m_per_deg_lat, lon0 + dx / m_per_deg_lon, cell_radius_m)
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
        body: dict = {
            "textQuery": query,
            "pageSize": PAGE_SIZE,
            "locationRestriction": {
                "circle": {
                    "center": {"latitude": cell.lat, "longitude": cell.lon},
                    "radius": cell.radius_m,
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
    """Overture rows near a cell, as (id, name, lat, lon). A generous bbox: the
    cell radius plus the match radius, so a business just outside the cell can
    still match a Google result just inside it."""
    pad_m = cell.radius_m + SAME_PLACE_M
    dlat = pad_m / 111_320.0
    dlon = pad_m / (111_320.0 * math.cos(math.radians(cell.lat)))
    return con.execute(
        f"""
        SELECT id, name, lat, lon FROM read_parquet('{parquet}')
        WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
        """,
        [cell.lat - dlat, cell.lat + dlat, cell.lon - dlon, cell.lon + dlon],
    ).fetchall()


def match_one(g_name: str, g_lat: float, g_lon: float, candidates) -> str | None:
    """The Overture id for a Google place, or None.

    Distance gates first, then name. Erring toward *not* matching: an
    unmatched-but-really-present business understates coverage, and understating
    is the safe direction for a gate we are trying to honestly pass.
    """
    best, best_score = None, 0.0
    for oid, oname, olat, olon in candidates:
        d = metres_between(g_lat, g_lon, olat, olon)
        if d > SAME_PLACE_M:
            continue
        s = similarity(g_name, oname or "")
        if s >= NAME_SIMILARITY and s > best_score:
            best, best_score = oid, s
    return best


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


def run_market(con, key: str, market: dict, radius_miles: float,
               sample: int, dry_run: bool) -> MarketResult:
    niche = market["niche"]
    query = NICHE_QUERY.get(niche)
    if not query:
        raise SystemExit(f"No Google query defined for niche {niche!r}")

    parquet = DATA / f"overture-{market['id']}.parquet"
    if not parquet.exists():
        raise SystemExit(f"Missing {parquet}. Run overture_extract.py first.")

    cells = tile(market["center"], radius_miles, CELL_RADIUS_M)
    rng = random.Random(f"{SEED}:{market['id']}")
    chosen = rng.sample(cells, min(sample, len(cells)))

    result = MarketResult(market=market["id"], niche=niche)
    if dry_run:
        result.cells_sampled = len(chosen)
        # Worst case is MAX_PAGES per cell; most cells need one.
        result.requests = len(chosen) * MAX_PAGES
        return result

    seen: set[str] = set()
    for cell in chosen:
        places, reqs, truncated = search_cell(key, query, cell)
        result.requests += reqs
        result.cells_sampled += 1
        if truncated:
            # We cannot tell what a saturated cell left out, so it is excluded
            # rather than counted as if it were complete.
            result.cells_truncated += 1
            continue

        candidates = overture_in_cell(con, parquet, cell)
        for p in places:
            pid = p.get("id")
            if not pid or pid in seen:
                continue
            seen.add(pid)
            name = (p.get("displayName") or {}).get("text", "")
            loc = p.get("location") or {}
            oid = match_one(name, loc.get("latitude", 0.0), loc.get("longitude", 0.0),
                            candidates)
            # Only the id and the verdict survive this loop.
            result.matches.append(_Match(pid, oid is not None, oid))
            result.google_places += 1
            if oid:
                result.matched += 1

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
    print(f"{'market'.ljust(w)}  cells  trunc  google  matched  COVERAGE  95% CI")
    for r in results:
        lo, hi = wilson(r.matched, r.google_places)
        print(f"{r.market.ljust(w)}  {r.cells_sampled:>5}  {r.cells_truncated:>5}  "
              f"{r.google_places:>6}  {r.matched:>7}  "
              f"{100 * r.coverage:>7.1f}%  {100 * lo:.1f}–{100 * hi:.1f}%")

    total_reqs = sum(r.requests for r in results)
    print(f"\nRequests spent: {total_reqs} ≈ ${total_reqs * PRICE_PER_REQUEST:.2f} "
          f"(list-price estimate).")

    gate = [r for r in results if r.google_places]
    if gate:
        worst = min(wilson(r.matched, r.google_places)[0] for r in gate)
        print(f"Gate item 1 needs >= 70%. Lowest lower-bound across markets: "
              f"{100 * worst:.1f}% — {'PASSES' if worst >= 0.70 else 'DOES NOT PASS'} "
              f"on the conservative reading.")

    out = DATA / "google-baseline.json"
    out.write_text(json.dumps(
        [
            {
                "market": r.market, "niche": r.niche,
                "cells_sampled": r.cells_sampled, "cells_truncated": r.cells_truncated,
                "requests": r.requests, "google_places": r.google_places,
                "matched": r.matched, "coverage": round(r.coverage, 4),
                "ci95": [round(x, 4) for x in wilson(r.matched, r.google_places)],
                # Place IDs and verdicts only — never Google's names or coordinates.
                "places": [{"place_id": m.place_id, "matched": m.matched,
                            "overture_id": m.overture_id} for m in r.matches],
            }
            for r in results
        ], indent=2) + "\n")
    print(f"\n→ {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
