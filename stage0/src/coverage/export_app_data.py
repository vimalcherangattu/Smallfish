"""Export measured Stage 0 data for the app to serve (feeds S1-01, S1-20, S1-21).

The app shows **real businesses and real evidence**, not fixtures. This script joins
what has actually been measured:

- candidates from Overture (`overture-*.parquet`)
- site readability and technology signals from the probe (`siteprobe-*.jsonl`)
- verdicts from the absence-proof rule (`engine/absence.py`)

Nothing is invented. A business the probe never visited is exported as `unread`,
which is honest and also shows the cold-market problem the product document glosses
over: most of a market is unread until someone pays to read it.

Presence criteria ("offers Botox") export as `needs_model`, because technology
detection cannot settle them and no model has run. That is the two-layer design
made visible rather than hidden.

Usage:
    python3 stage0/src/coverage/export_app_data.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from engine.absence import AbsenceEvidence, Verdict, judge_absence  # noqa: E402
from engine.check_plan import plan_for_search  # noqa: E402

DATA = ROOT / "stage0" / "data"
FIXTURES = ROOT / "stage0" / "fixtures" / "benchmarks.json"
OUT = ROOT / "public" / "data"

# Which technology family speaks to which criterion. Mirrors check_plan's
# recognised set; absent means no detector covers it.
CRITERION_FAMILY = {
    "no_online_booking": "booking",
    "no_quote_form": "quote_form",
}


def load_probes(market_id: str) -> dict[str, dict]:
    path = DATA / f"siteprobe-{market_id}.jsonl"
    if not path.exists():
        return {}
    probes = {}
    for line in path.open():
        row = json.loads(line)
        probes[row["place_id"]] = row
    return probes


def verdict_for(criterion: dict, probe: dict | None) -> dict:
    """Judge one criterion against what the probe actually found."""
    cid = criterion["id"]
    kind = criterion.get("type", "presence")

    if probe is None:
        return {
            "verdict": "unread",
            "reason": "this business has not been read yet",
        }

    if kind != "absence":
        # Technology detection cannot settle a presence criterion about services.
        return {
            "verdict": "needs_model",
            "reason": "needs the page text read by a model; no model has run",
        }

    family = CRITERION_FAMILY.get(cid)
    signal_found = False
    source = None
    if family == "booking":
        signal_found = probe.get("booking_signal", False)
        vendors = probe.get("booking_vendors") or []
        if signal_found:
            source = (
                f"{vendors[0]} detected in the page source"
                if vendors
                else "a booking link or widget was found on the site"
            )
    elif family == "quote_form":
        signal_found = probe.get("quote_form_signal", False)
        if signal_found:
            source = "a quote or estimate route was found on the site"

    pages_read = probe.get("pages_fetched", 0)
    result = judge_absence(
        AbsenceEvidence(
            criterion_id=cid,
            pages_read=pages_read,
            site_outcome=probe.get("outcome", "unknown"),
            # Pages beyond the homepage that the check plan selected and we reached.
            targeted_pages_read=max(pages_read - 1, 0),
            positive_signal_found=signal_found,
            positive_signal_source=source,
            detector_covers_criterion=family is not None,
        )
    )
    return {
        "verdict": result.verdict.value,
        "reason": result.reason,
        **({"proof": result.proof} if result.proof else {}),
    }


def export_market(con: duckdb.DuckDBPyConnection, market: dict) -> dict:
    mid = market["id"]
    parquet = DATA / f"overture-{mid}.parquet"
    if not parquet.exists():
        raise SystemExit(f"Missing {parquet}. Run overture_extract.py first.")

    probes = load_probes(mid)
    rows = con.execute(
        f"""
        SELECT id, name, category, lat, lon,
               coalesce(address, '')  AS address,
               coalesce(locality, '') AS locality,
               coalesce(region, '')   AS region,
               CASE WHEN len(websites) > 0 THEN websites[1] ELSE NULL END AS website,
               CASE WHEN len(phones)   > 0 THEN phones[1]   ELSE NULL END AS phone,
               is_primary_category
        FROM read_parquet('{parquet}')
        ORDER BY is_primary_category DESC, name
        """
    ).fetchall()

    cols = [
        "id", "name", "category", "lat", "lon", "address", "locality",
        "region", "website", "phone", "is_primary",
    ]

    businesses = []
    for row in rows:
        b = dict(zip(cols, row))
        probe = probes.get(b["id"])

        record = {
            "id": b["id"],
            "name": b["name"] or "(unnamed)",
            "cat": b["category"],
            "lat": round(b["lat"], 6),
            "lon": round(b["lon"], 6),
            "addr": ", ".join(x for x in [b["address"], b["locality"], b["region"]] if x),
            "site": b["website"],
            "phone": b["phone"],
            "primary": bool(b["is_primary"]),
        }

        if probe:
            record["read"] = {
                "outcome": probe["outcome"],
                "pages": probe.get("pages_fetched", 0),
                "chars": probe.get("homepage_text_chars", 0),
                "booking": probe.get("booking_signal", False),
                "vendors": probe.get("booking_vendors") or [],
                "quote": probe.get("quote_form_signal", False),
                "chat": probe.get("chat_signal", False),
                "cms": probe.get("cms") or [],
            }

        record["verdicts"] = {
            c["id"]: verdict_for(c, probe) for c in market["criteria"]
        }
        businesses.append(record)

    plan = plan_for_search(market["criteria"])
    tallies: dict[str, dict[str, int]] = {}
    for c in market["criteria"]:
        counts: dict[str, int] = {}
        for b in businesses:
            v = b["verdicts"][c["id"]]["verdict"]
            counts[v] = counts.get(v, 0) + 1
        tallies[c["id"]] = counts

    return {
        "id": mid,
        "niche": market["niche"],
        "metro": market["metro"],
        "center": market["center"],
        "search": market["search"],
        "criteria": [
            {
                **c,
                "explain": next(
                    p.explain() for p in plan.criteria if p.criterion_id == c["id"]
                ),
                "needsModel": next(
                    not p.settleable_without_model
                    for p in plan.criteria
                    if p.criterion_id == c["id"]
                ),
            }
            for c in market["criteria"]
        ],
        "checkPlanTargets": [w for w, _ in plan.link_keywords[:8]],
        "counts": {
            "candidates": len(businesses),
            "primary": sum(1 for b in businesses if b["primary"]),
            "withSite": sum(1 for b in businesses if b["site"]),
            "read": sum(1 for b in businesses if "read" in b),
        },
        "tallies": tallies,
        "businesses": businesses,
    }


def main() -> int:
    spec = json.loads(FIXTURES.read_text())
    con = duckdb.connect()
    OUT.mkdir(parents=True, exist_ok=True)

    index = []
    for market in spec["markets"]:
        payload = export_market(con, market)
        path = OUT / f"{market['id']}.json"
        path.write_text(json.dumps(payload, separators=(",", ":")))
        size_kb = round(path.stat().st_size / 1024)
        c = payload["counts"]
        print(
            f"{market['id']:16} {c['candidates']:>5} candidates, "
            f"{c['read']:>3} read  →  {size_kb} KB"
        )
        index.append(
            {
                "id": payload["id"],
                "niche": payload["niche"],
                "metro": payload["metro"],
                "center": payload["center"],
                "search": payload["search"],
                "counts": c,
            }
        )

    (OUT / "index.json").write_text(
        json.dumps(
            {"release": spec["overture_release"], "markets": index}, indent=2
        )
        + "\n"
    )
    print(f"\nIndex → {(OUT / 'index.json').relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
