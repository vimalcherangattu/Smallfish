"""Pull Overture Places candidates for the Stage 0 benchmark markets (task S0-02).

Reads the public Overture parquet release straight over HTTPS with DuckDB, so there
is nothing to download and no AWS credentials involved. The `bbox` struct column
gives row-group pruning, which is why a metro-sized query touches a few hundred MB
of a 10.5 GB dataset and returns in seconds.

Usage:
    python3 stage0/src/coverage/overture_extract.py
    python3 stage0/src/coverage/overture_extract.py --market med-spa-dallas
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "stage0" / "fixtures" / "benchmarks.json"
DATA = ROOT / "stage0" / "data"

S3_BASE = "https://overturemaps-us-west-2.s3.amazonaws.com/"
MILES_PER_DEG_LAT = 69.0


def list_place_files(release: str) -> list[str]:
    """List the release's place parquet files via the bucket's public index."""
    prefix = f"release/{release}/theme=places/type=place/"
    url = (
        f"{S3_BASE}?list-type=2&prefix={urllib.parse.quote(prefix, safe='')}"
        "&max-keys=1000"
    )
    with urllib.request.urlopen(url, timeout=60) as resp:
        xml = resp.read().decode()
    keys = [k for k in re.findall(r"<Key>([^<]+)</Key>", xml) if k.endswith(".parquet")]
    if not keys:
        raise SystemExit(f"No parquet files found for release {release}")
    return [S3_BASE + k.replace("=", "%3D") for k in keys]


def bbox_for(lat: float, lon: float, radius_miles: float) -> dict[str, float]:
    """A generous bounding box around a point; the exact radius filter runs in SQL."""
    dlat = radius_miles / MILES_PER_DEG_LAT
    dlon = radius_miles / (MILES_PER_DEG_LAT * math.cos(math.radians(lat)))
    return {
        "xmin": lon - dlon,
        "xmax": lon + dlon,
        "ymin": lat - dlat,
        "ymax": lat + dlat,
    }


def connect() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    con.execute("SET enable_progress_bar=false;")
    con.execute("SET http_keep_alive=true;")
    con.execute("SET http_timeout=120000;")
    return con


def extract_market(
    con: duckdb.DuckDBPyConnection,
    files: list[str],
    market: dict,
    radius_miles: float,
) -> dict:
    box = bbox_for(market["center"]["lat"], market["center"]["lon"], radius_miles)
    cats = market["categories"]["primary"] + market["categories"]["expanded"]
    file_list = ", ".join(f"'{u}'" for u in files)
    cat_list = ", ".join(f"'{c}'" for c in cats)
    primary_list = ", ".join(f"'{c}'" for c in market["categories"]["primary"])

    # Haversine in SQL so the radius is exact rather than a box approximation.
    query = f"""
    WITH scanned AS (
        SELECT
            id,
            names.primary                     AS name,
            categories.primary                AS category,
            confidence,
            websites,
            phones,
            emails,
            socials,
            operating_status,
            addresses[1].freeform             AS address,
            addresses[1].locality             AS locality,
            addresses[1].region               AS region,
            addresses[1].postcode             AS postcode,
            ST_X(geometry)                    AS lon,
            ST_Y(geometry)                    AS lat
        FROM read_parquet([{file_list}])
        WHERE bbox.xmin BETWEEN {box['xmin']} AND {box['xmax']}
          AND bbox.ymin BETWEEN {box['ymin']} AND {box['ymax']}
          AND categories.primary IN ({cat_list})
    )
    , measured AS (
        SELECT
            *,
            3958.8 * 2 * ASIN(SQRT(
                POW(SIN(RADIANS(lat - {market['center']['lat']}) / 2), 2)
                + COS(RADIANS({market['center']['lat']})) * COS(RADIANS(lat))
                * POW(SIN(RADIANS(lon - {market['center']['lon']}) / 2), 2)
            )) AS distance_miles,
            category IN ({primary_list}) AS is_primary_category
        FROM scanned
    )
    SELECT * FROM measured
    WHERE distance_miles <= {radius_miles}
    ORDER BY is_primary_category DESC, distance_miles
    """

    con.execute("LOAD spatial;")
    DATA.mkdir(parents=True, exist_ok=True)
    out = DATA / f"overture-{market['id']}.parquet"

    started = time.time()
    con.execute(f"COPY ({query}) TO '{out}' (FORMAT PARQUET)")
    elapsed = round(time.time() - started, 1)

    total, primary_only, has_site, has_phone, open_now = con.execute(
        f"""
        SELECT
            count(*),
            count(*) FILTER (WHERE is_primary_category),
            count(*) FILTER (WHERE len(websites) > 0),
            count(*) FILTER (WHERE len(phones) > 0),
            count(*) FILTER (WHERE operating_status = 'open')
        FROM read_parquet('{out}')
        """
    ).fetchone()

    return {
        "market": market["id"],
        "niche": market["niche"],
        "metro": market["metro"],
        "candidates_total": total,
        "candidates_primary_category": primary_only,
        "candidates_expanded_category": total - primary_only,
        "with_website": has_site,
        "with_website_pct": round(100 * has_site / total, 1) if total else 0.0,
        "with_phone": has_phone,
        "with_phone_pct": round(100 * has_phone / total, 1) if total else 0.0,
        "operating_status_open": open_now,
        "query_seconds": elapsed,
        "output": str(out.relative_to(ROOT)),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--market", help="Limit to one market id")
    args = parser.parse_args()

    spec = json.loads(FIXTURES.read_text())
    markets = spec["markets"]
    if args.market:
        markets = [m for m in markets if m["id"] == args.market]
        if not markets:
            raise SystemExit(f"Unknown market: {args.market}")

    print(f"Overture release {spec['overture_release']}")
    files = list_place_files(spec["overture_release"])
    print(f"{len(files)} parquet files\n")

    con = connect()
    summaries = []
    for market in markets:
        print(f"→ {market['id']} ({market['metro']})", flush=True)
        summary = extract_market(con, files, market, spec["radius_miles"])
        summaries.append(summary)
        print(
            f"  {summary['candidates_total']:,} candidates "
            f"({summary['candidates_primary_category']:,} primary category), "
            f"{summary['with_website_pct']}% with a website, "
            f"{summary['query_seconds']}s\n",
            flush=True,
        )

    out = DATA / "overture-summary.json"
    out.write_text(json.dumps(summaries, indent=2) + "\n")
    print(f"Summary → {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
