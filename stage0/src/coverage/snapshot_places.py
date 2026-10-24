"""Copy the US places from an Overture release into storage we own — data sourcing step 1.

## Why this exists

On 2026-10-24 every search in production returned 500 for hours. `supply.ts` read
Overture's release live, in the request, and Overture deleted that release — it keeps
about two months online. The surviving releases had also renamed the category column
and most of its ids. A third party's retention policy and schema were our uptime.

This makes them a scheduled job's problem instead. It copies one release's US places,
only the columns the product reads, into our bucket, and **promotes the copy only if it
passes a contract**. If Overture deletes, renames or thins anything, the job fails, the
previous copy stays live, and search never notices. `docs/DATA-SOURCING.md`.

## The contract, which is the point

1. **Schema.** The columns the copy is built from exist, with `taxonomy.primary`.
2. **Vocabulary.** At least 98% of the category ids in `public/data/trades.json` — the
   ids the app will send — exist in the new copy. A rename like 2026-10-24's fails here.
3. **Canaries.** Fifteen fixed trade × city counts, each within ±15% of the copy that
   is live now, and none zero. A thinned or broken release fails here.

Only then is `manifest.json` rewritten, and the app reads only what the manifest names.

## Shape of the copy

Flat columns (`cat`, `lon`, `lat`, `site` …) so the app's query needs neither the
spatial extension nor nested-struct access, and sorted along a Hilbert curve so a
city's rows sit together: a 25-mile radius touches a few row groups, not the country.

Usage:
    python3 stage0/src/coverage/snapshot_places.py --out DIR          # local, to measure
    python3 stage0/src/coverage/snapshot_places.py --r2               # build and promote
    python3 stage0/src/coverage/snapshot_places.py --r2 --release 2026-10-21.0
    python3 stage0/src/coverage/snapshot_places.py --r2 --if-new         # the weekly job

`--r2` reads R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[3]
TRADES = ROOT / "public" / "data" / "trades.json"
PLACES = ROOT / "public" / "data" / "places-us.json"
S3_BASE = "https://overturemaps-us-west-2.s3.amazonaws.com/"

SCHEMA_VERSION = 2
# Tiles: 2° grid cells (~140 miles), each cut into chunks of TILE_ROWS along a
# Hilbert curve. Measured 2026-10-24 from a cold DuckDB, ENAM bucket, 16 threads:
# a city search opening only the tiles whose box overlaps it took 2.0-4.6 s,
# against 4.2-5.9 s for the five 256 MB files of schema 1 (and 11-25 s for those
# at DuckDB's default 2 threads). The grid cell is what keeps every tile's box
# small: Hilbert chunks alone left two tiles spanning half the continent, which
# every search then had to open.
GRID_DEGREES = 2
TILE_ROWS = 100_000
LAYOUT = "grid2"
RADIUS_MILES = 25  # supply.ts RADIUS_MILES — the canaries must ask what the app asks
TOLERANCE = 0.15
VOCABULARY_FLOOR = 0.98

REQUIRED = [
    "id", "geometry", "websites", "phones", "addresses", "names", "taxonomy",
    "brand", "operating_status", "confidence", "sources", "bbox",
]

# Trade anchor × city. Spread across the measured markets, the HVAC market where
# coverage is thinnest, and cities nobody has touched. The anchor's taxonomy
# descendants come with it, as they do in `trades.ts`.
CANARIES = [
    ("dental_clinic", "Denver", "US-CO"),
    ("dental_clinic", "Phoenix", "US-AZ"),
    ("plumbing", "Denver", "US-CO"),
    ("hvac_service", "Tampa", "US-FL"),
    ("medical_spa", "Dallas", "US-TX"),
    ("veterinarian", "Columbus", "US-OH"),
    ("roofing", "Austin", "US-TX"),
    ("attorney_or_law_firm", "Chicago", "US-IL"),
    ("chiropractic", "Seattle", "US-WA"),
    ("electrician", "Atlanta", "US-GA"),
    ("landscaping", "Charlotte", "US-NC"),
    ("accountant", "Boise", "US-ID"),
    ("beauty_salon", "Portland", "US-OR"),
    ("automotive_repair", "Kansas City", "US-MO"),
    ("gym", "New York", "US-NY"),
]


def live_releases() -> list[str]:
    url = f"{S3_BASE}?list-type=2&prefix=release%2F&delimiter=%2F"
    with urllib.request.urlopen(url, timeout=60) as r:
        xml = r.read().decode()
    return sorted(re.findall(r"<Prefix>release/([^<]+)/</Prefix>", xml), reverse=True)


def place_files(release: str) -> list[str]:
    prefix = f"release/{release}/theme=places/type=place/"
    url = f"{S3_BASE}?list-type=2&prefix={urllib.parse.quote(prefix, safe='')}&max-keys=1000"
    with urllib.request.urlopen(url, timeout=60) as r:
        xml = r.read().decode()
    keys = [k for k in re.findall(r"<Key>([^<]+)</Key>", xml) if k.endswith(".parquet")]
    return [S3_BASE + k.replace("=", "%3D") for k in keys]


def connect(r2: bool) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;")
    con.execute("SET enable_progress_bar=false; SET http_keep_alive=true; SET http_timeout=600000;")
    con.execute("SET preserve_insertion_order=false;")
    if r2:
        missing = [k for k in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET") if not os.environ.get(k)]
        if missing:
            raise SystemExit(f"--r2 needs {', '.join(missing)}")
        con.execute(
            "CREATE SECRET r2 (TYPE r2, KEY_ID ?, SECRET ?, ACCOUNT_ID ?)",
            [os.environ["R2_ACCESS_KEY_ID"], os.environ["R2_SECRET_ACCESS_KEY"], os.environ["R2_ACCOUNT_ID"]],
        )
    return con


def check_schema(con, files: list[str]) -> list[str]:
    cols = {r[0]: r[1] for r in con.execute(f"DESCRIBE SELECT * FROM read_parquet('{files[0]}')").fetchall()}
    problems = [f"missing column {c}" for c in REQUIRED if c not in cols]
    if "taxonomy" in cols and '"primary"' not in cols["taxonomy"] and "primary" not in cols["taxonomy"]:
        problems.append(f"taxonomy has no primary: {cols['taxonomy']}")
    return problems


def build(con, files: list[str], dest: str) -> float:
    file_list = ", ".join(f"'{u}'" for u in files)
    started = time.time()
    # Only the columns the product reads, flattened. `sources` keeps the dataset
    # names only — provenance, not the provider's payload.
    con.execute(
        f"""
        COPY (
         SELECT * EXCLUDE (h, cell),
                cell || '-' || ((row_number() OVER (PARTITION BY cell ORDER BY h) - 1) // {TILE_ROWS}) AS tile
         FROM (
          SELECT id,
                 names.primary                                  AS name,
                 taxonomy.primary                               AS cat,
                 basic_category                                 AS basic,
                 websites[1]                                    AS site,
                 phones[1]                                      AS phone,
                 addresses[1].freeform                          AS addr,
                 addresses[1].locality                          AS town,
                 addresses[1].region                            AS state,
                 addresses[1].postcode                          AS postcode,
                 brand.names.primary                            AS brand,
                 brand.wikidata                                 AS brand_wikidata,
                 operating_status                               AS status,
                 confidence,
                 list_distinct([s.dataset FOR s IN sources])    AS datasets,
                 ST_X(geometry)                                 AS lon,
                 ST_Y(geometry)                                 AS lat,
                 floor(ST_Y(geometry) / {GRID_DEGREES})::INT || '_' ||
                   floor(ST_X(geometry) / {GRID_DEGREES})::INT  AS cell,
                 ST_Hilbert(ST_X(geometry), ST_Y(geometry),
                            {{'min_x': -180, 'min_y': 10, 'max_x': -60, 'max_y': 75}}::BOX_2D) AS h
          FROM read_parquet([{file_list}])
          WHERE addresses[1].country = 'US'
         )
        ) TO '{dest}' (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 20000,
                       PARTITION_BY (tile), OVERWRITE_OR_IGNORE)
        """
    )
    return time.time() - started


def tile_index(con, dest: str) -> list[dict]:
    """Each tile's file and bounding box, so the app opens only the tiles a search overlaps."""
    rows = con.execute(
        f"""
        SELECT filename, min(lon), max(lon), min(lat), max(lat), count(*)
        FROM read_parquet('{dest}/*/*.parquet', filename=true, hive_partitioning=false)
        GROUP BY filename
        """
    ).fetchall()
    prefix = dest.rstrip("/") + "/"
    return [
        {
            "f": r[0][len(prefix):] if r[0].startswith(prefix) else r[0].split("/", 3)[-1],
            "b": [round(r[1], 5), round(r[2], 5), round(r[3], 5), round(r[4], 5)],
            "n": int(r[5]),
        }
        for r in rows
    ]


def family(cats: list[dict], anchor: str) -> list[str]:
    return [c["id"] for c in cats if c["id"] == anchor or anchor in (c.get("path") or [])[:-1]]


def radius_sql(lat: float, lon: float, miles: float = RADIUS_MILES) -> str:
    dlat = miles / 69.0
    dlon = miles / (69.0 * math.cos(math.radians(lat)))
    return (
        f"lon BETWEEN {lon - dlon} AND {lon + dlon} AND lat BETWEEN {lat - dlat} AND {lat + dlat} "
        f"AND 3958.8 * 2 * ASIN(SQRT(POW(SIN(RADIANS(lat - {lat})/2),2) + COS(RADIANS({lat})) "
        f"* COS(RADIANS(lat)) * POW(SIN(RADIANS(lon - {lon})/2),2))) <= {miles}"
    )


def canaries(con, glob: str) -> dict[str, int]:
    cats = json.loads(TRADES.read_text())["categories"]
    cities = {(c["name"], c["state"]): c["center"] for c in json.loads(PLACES.read_text())["cities"]}
    out = {}
    for anchor, city, state in CANARIES:
        lon, lat = cities[(city, state)]
        ids = ", ".join(f"'{i}'" for i in family(cats, anchor))
        n = con.execute(
            f"SELECT count(*) FROM read_parquet('{glob}') WHERE cat IN ({ids}) AND {radius_sql(lat, lon)}"
        ).fetchone()[0]
        out[f"{anchor} @ {city}"] = int(n)
    return out


def vocabulary(con, glob: str) -> float:
    ids = [c["id"] for c in json.loads(TRADES.read_text())["categories"]]
    present = {r[0] for r in con.execute(f"SELECT DISTINCT cat FROM read_parquet('{glob}')").fetchall()}
    return sum(1 for i in ids if i in present) / len(ids)


def gate(new: dict[str, int], old: dict[str, int] | None, vocab: float) -> list[str]:
    problems = []
    if vocab < VOCABULARY_FLOOR:
        problems.append(f"only {vocab:.1%} of trades.json ids exist in the copy (floor {VOCABULARY_FLOOR:.0%})")
    for k, n in new.items():
        if n == 0:
            problems.append(f"{k}: zero")
        prev = (old or {}).get(k)
        if prev and abs(n - prev) / prev > TOLERANCE:
            problems.append(f"{k}: {n:,} against {prev:,} live ({(n - prev) / prev:+.0%})")
    return problems


def r2_client():
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def put_json(key: str, obj) -> None:
    """One JSON document, byte for byte. The app parses it with JSON.parse, so it
    must be plain JSON rather than DuckDB's newline-delimited export."""
    r2_client().put_object(
        Bucket=os.environ["R2_BUCKET"],
        Key=key,
        Body=json.dumps(obj, separators=(",", ":")).encode(),
        ContentType="application/json",
    )


def prune(keep: set[str]) -> list[str]:
    """Delete every copy under `places/` except the releases in `keep`.

    Without this the bucket grows by a copy a month (1.2 GB measured, 2026-10-24)
    and passes R2's free 10 GB in about eight months. Two are kept, the live one
    and the one before it, so a bad promotion can be rolled back by pointing
    `manifest.json` at the previous release. A copy that failed its contract is
    in neither and goes too.

    boto3 rather than DuckDB because DuckDB cannot delete objects. Imported here
    so a local `--out` run needs only duckdb.
    """
    s3 = r2_client()
    bucket = os.environ["R2_BUCKET"]
    gone: list[str] = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix="places/"):
        doomed = [o["Key"] for o in page.get("Contents", []) if o["Key"].split("/")[1] not in keep]
        for i in range(0, len(doomed), 1000):
            s3.delete_objects(Bucket=bucket, Delete={"Objects": [{"Key": k} for k in doomed[i : i + 1000]]})
        gone += doomed
    return gone


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--release")
    ap.add_argument("--out", help="local directory, to measure without promoting")
    ap.add_argument("--r2", action="store_true", help="build in our bucket and promote if the contract holds")
    ap.add_argument("--if-new", action="store_true", help="do nothing when the live copy is already this release")
    args = ap.parse_args()
    if bool(args.out) == bool(args.r2):
        raise SystemExit("one of --out or --r2")

    release = args.release or live_releases()[0]
    files = place_files(release)
    if not files:
        raise SystemExit(f"release {release} has no place files")
    con = connect(args.r2)

    problems = check_schema(con, files)
    if problems:
        print("SCHEMA FAILED, nothing written:\n  " + "\n  ".join(problems))
        return 2

    bucket = os.environ.get("R2_BUCKET", "")
    base = f"r2://{bucket}" if args.r2 else str(Path(args.out).resolve())
    # One folder per release *and* layout, so a new layout of the same release
    # never writes over the copy that is live, and the switch is one manifest write.
    copy_id = f"{release}.{LAYOUT}"
    dest = f"{base}/places/{copy_id}"
    glob = f"{dest}/*/*.parquet"

    live = None
    if args.r2:
        try:
            live = con.execute(f"SELECT * FROM read_json('{base}/manifest.json')").fetchone()
            live = dict(zip([d[0] for d in con.description], live))
        except duckdb.Error:
            live = None  # first run: nothing live to compare against
    elif (Path(args.out) / "manifest.json").exists():
        live = json.loads((Path(args.out) / "manifest.json").read_text())

    live_dir = (live or {}).get("dir") or (live or {}).get("release")
    if args.if_new and live and live_dir == copy_id:
        print(f"live copy is already {release}; nothing to do")
        return 0
    if not args.r2:
        (Path(args.out) / "places").mkdir(parents=True, exist_ok=True)
    print(f"release {release}: {len(files)} files → {dest}", flush=True)
    secs = build(con, files, dest)
    rows = con.execute(f"SELECT count(*), count(*) FILTER (WHERE site IS NOT NULL AND length(trim(site)) > 3) FROM read_parquet('{glob}')").fetchone()
    print(f"built {rows[0]:,} US places ({rows[1]:,} with a site) in {secs:.0f}s", flush=True)

    counts = canaries(con, glob)
    vocab = vocabulary(con, glob)
    for k, n in counts.items():
        print(f"  {k:40} {n:>7,}")
    print(f"  vocabulary: {vocab:.1%} of trades.json ids present")

    problems = gate(counts, (live or {}).get("canaries"), vocab)
    if problems:
        print("CONTRACT FAILED, the live copy stays live:\n  " + "\n  ".join(problems))
        if args.r2:
            # The failed copy is not kept; the live one and its predecessor are.
            keep = {r for r in (live_dir, (live or {}).get("previous")) if r}
            print(f"removed {len(prune(keep))} objects of the failed copy")
        return 3

    index = tile_index(con, dest)
    print(f"  {len(index)} tiles", flush=True)
    manifest = {
        "schema": SCHEMA_VERSION,
        "release": release,
        "layout": LAYOUT,
        "dir": copy_id,
        "index": f"places/{copy_id}/index.json",
        "tiles": len(index),
        "rows": int(rows[0]),
        "withSite": int(rows[1]),
        "builtAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "buildSeconds": round(secs),
        "vocabulary": round(vocab, 4),
        "canaries": counts,
        "previous": live_dir,
    }
    if args.r2:
        # The index first: the manifest is what the app follows, so it must
        # never name an index that is not there yet.
        put_json(f"places/{copy_id}/index.json", index)
        put_json("manifest.json", manifest)
        # Only after the manifest points at the new copy, so nothing live is
        # ever deleted.
        keep = {copy_id} | ({manifest["previous"]} if manifest["previous"] else set())
        gone = prune(keep)
        print(f"kept {sorted(keep)}, removed {len(gone)} older objects")
    else:
        (Path(args.out) / "places" / copy_id / "index.json").write_text(json.dumps(index) + "\n")
        (Path(args.out) / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"PROMOTED {copy_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
