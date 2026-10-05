"""Generate `public/data/trades.json` — the Overture category taxonomy with counts.

The app lets somebody search for any kind of business anywhere in the US. The
candidate data is organised by a fixed taxonomy, so "plumbers" has to land on
`plumbing` or there is nothing to read. `src/lib/trades.ts` does that mapping
lexically, and this is the list it maps onto.

**Every number in the file is measured, not derived.** One pass over the whole
US extent of the release, grouping by `categories.primary`, counting listings
and counting the ones that carry a website. 1,944 categories, 133 seconds,
~17.2M listings on the 2026-08-19.0 release.

An earlier attempt estimated the counts by scanning one of the sixteen shards
and multiplying by sixteen. **That was wrong and the error was large**: shard 0
holds 11,816 dentists, which predicts 189,056, against the measured 120,381.
The shards are not uniform. Do not extrapolate from one.

Usage:
    python3 stage0/src/coverage/export_trades.py
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "stage0" / "fixtures" / "benchmarks.json"
OUT = ROOT / "public" / "data" / "trades.json"

S3_BASE = "https://overturemaps-us-west-2.s3.amazonaws.com/"

# The contiguous US plus a margin. Alaska and Hawaii sit outside it; this bound
# exists to let the row-group pruning do its job, and `places-us.json` — which
# decides what a search can name — is built from the same release's divisions.
US_BBOX = {"xmin": -125.0, "xmax": -66.0, "ymin": 24.0, "ymax": 50.0}

# Categories below this are too thin to be worth offering anywhere: a category
# with eleven listings in the whole country cannot support a city search, and
# keeping them makes the near-miss list on screen unreadable.
MIN_LISTINGS = 50


def list_place_files(release: str) -> list[str]:
    """The release's place parquet files, via the bucket's public index."""
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


def main() -> int:
    release = json.loads(FIXTURES.read_text())["overture_release"]
    files = list_place_files(release)
    print(f"Overture release {release}, {len(files)} place files", flush=True)

    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    con.execute("SET enable_progress_bar=false;")
    con.execute("SET http_keep_alive=true;")
    con.execute("SET http_timeout=600000;")

    file_list = ", ".join(f"'{u}'" for u in files)
    started = time.time()
    rows = con.execute(
        f"""
        SELECT categories.primary                              AS id,
               count(*)                                        AS n,
               count(*) FILTER (WHERE len(websites) > 0)        AS site
        FROM read_parquet([{file_list}])
        WHERE bbox.xmin BETWEEN {US_BBOX['xmin']} AND {US_BBOX['xmax']}
          AND bbox.ymin BETWEEN {US_BBOX['ymin']} AND {US_BBOX['ymax']}
          AND categories.primary IS NOT NULL
        GROUP BY 1
        HAVING count(*) >= {MIN_LISTINGS}
        ORDER BY 2 DESC
        """
    ).fetchall()
    elapsed = round(time.time() - started)

    cats = [{"id": r[0], "n": int(r[1]), "site": int(r[2])} for r in rows]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "release": release,
                "measuredSeconds": elapsed,
                "listings": sum(c["n"] for c in cats),
                "withSite": sum(c["site"] for c in cats),
                "minListings": MIN_LISTINGS,
                "categories": cats,
            },
            separators=(",", ":"),
        )
        + "\n"
    )
    size_kb = OUT.stat().st_size / 1024
    print(
        f"wrote {OUT.relative_to(ROOT)} ({size_kb:.0f} KB) — "
        f"{len(cats):,} categories, {sum(c['n'] for c in cats):,} listings, "
        f"{sum(c['site'] for c in cats):,} with a website, {elapsed}s",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
