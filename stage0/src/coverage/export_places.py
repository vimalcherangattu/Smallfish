"""US places the app can resolve a typed search against (S2-09).

    python3 stage0/src/coverage/export_places.py

Writes `public/data/places-us.json`: every US state, and every city big enough
to be worth naming, each with a centre and a bounding box.

**Why this is generated rather than typed.** The app has to turn "carpenters in
Austin" and "roofers in Texas" into a region it can actually read. The quick
version of that is a hand-written table of city coordinates, and it is wrong in
a way that is hard to see: a centre that is thirty miles off silently reads the
wrong businesses and nothing in the product can tell. These come from Overture
Divisions — the same release, over the same HTTPS path, as the candidate
businesses in `overture_extract.py` — so a city's centre and the businesses
found near it agree by construction.

**The population cut is a product decision, not a data one.** Cities are
included down to `MIN_CITY_POP`, which is low enough that a user typing a small
county seat gets a hit, and high enough that the file stays a few hundred
kilobytes rather than several megabytes. A place below the cut is not
unsearchable — it falls back to its state, and the app says so rather than
pretending the search failed.

A state carries no outline. It is read by sampling its largest cities, which is
both cheaper than a statewide scan and the thing the user actually wants — the
"narrow it down" list is the same set of cities.

`population` is Overture's, and it is absent for about a third of US localities.
Those are dropped: a city with no population is one this file cannot rank, and
an unranked city in the "narrow it down" list would be noise.
"""

from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "stage0" / "fixtures" / "benchmarks.json"
OUT = ROOT / "public" / "data" / "places-us.json"

S3_BASE = "https://overturemaps-us-west-2.s3.amazonaws.com/"

# Low enough that a county seat resolves, high enough that the file stays small.
MIN_CITY_POP = 20_000


def division_files(release: str) -> list[str]:
    prefix = f"release/{release}/theme=divisions/type=division/"
    url = (
        f"{S3_BASE}?list-type=2&prefix={urllib.parse.quote(prefix, safe='')}"
        "&max-keys=1000"
    )
    with urllib.request.urlopen(url, timeout=60) as resp:
        xml = resp.read().decode()
    keys = [k for k in re.findall(r"<Key>([^<]+)</Key>", xml) if k.endswith(".parquet")]
    if not keys:
        raise SystemExit(f"No division files for release {release}")
    return [S3_BASE + k.replace("=", "%3D") for k in keys]


def main() -> int:
    release = json.loads(FIXTURES.read_text())["overture_release"]
    files = division_files(release)
    src = "[" + ", ".join(f"'{f}'" for f in files) + "]"

    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    con.execute("SET enable_progress_bar=false;")
    con.execute("SET http_timeout=180000;")

    # bbox is a plain struct on the row, so the centre needs no spatial
    # extension and no geometry decode — which matters when this reads a
    # remote parquet over HTTPS.
    # **No bounding box for a state, on purpose.** A `type=division` row is a
    # representative *point*, so its `bbox` has all four corners equal — the
    # first version of this shipped Texas as a zero-area box, which every
    # containment test would have answered "nothing is in Texas". The areas
    # live in `type=division_area` and are large; we do not need them, because
    # a state is read by sampling its cities rather than by its outline.
    states = con.execute(f"""
        select region as code,
               names.primary as name,
               population as pop,
               (bbox.xmin + bbox.xmax) / 2 as lon,
               (bbox.ymin + bbox.ymax) / 2 as lat
        from read_parquet({src})
        where country = 'US' and subtype = 'region'
        order by name
    """).fetchall()

    cities = con.execute(f"""
        select names.primary as name,
               region as state,
               population as pop,
               (bbox.xmin + bbox.xmax) / 2 as lon,
               (bbox.ymin + bbox.ymax) / 2 as lat
        from read_parquet({src})
        where country = 'US'
          and subtype = 'locality'
          and population >= {MIN_CITY_POP}
          and region is not null
        order by population desc
    """).fetchall()

    def state_row(r):
        code, name, pop, lon, lat = r
        return {
            "code": code,
            "name": name,
            "pop": pop,
            # The state's representative point, which is what Overture stores.
            # Not a centroid of its area, and never used as one.
            "center": [round(lon, 4), round(lat, 4)],
        }

    def city_row(r):
        name, state, pop, lon, lat = r
        return {
            "name": name,
            "state": state,
            "pop": pop,
            "center": [round(lon, 4), round(lat, 4)],
        }

    out = {
        "release": release,
        "source": "Overture Divisions",
        "minCityPop": MIN_CITY_POP,
        "states": [state_row(r) for r in states],
        "cities": [city_row(r) for r in cities],
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    size_kb = OUT.stat().st_size / 1024
    print(f"{len(out['states'])} states, {len(out['cities'])} cities >= {MIN_CITY_POP:,}")
    print(f"wrote {OUT.relative_to(ROOT)} ({size_kb:.0f} KB) from release {release}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
