"""Exercise every location shape against real data (task S0-29).

Proves the five shapes the product document names — city, radius, county, state and
drawn polygon — all resolve through one interface and all report a candidate count
before anything is spent.

The counts are the interesting part. They show how fast a region's cost grows as the
shape widens, which is the argument for the area guardrail in S1-21.

Usage:
    python3 stage0/src/coverage/region_demo.py
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from coverage.overture_extract import connect, list_place_files  # noqa: E402
from engine import geometry  # noqa: E402

FIXTURES = ROOT / "stage0" / "fixtures" / "benchmarks.json"
DATA = ROOT / "stage0" / "data"

# A rough box over the northern half of the Dallas-Fort Worth metroplex, as if
# someone had drawn it on the map.
DRAWN_DFW = {
    "type": "Polygon",
    "coordinates": [
        [
            [-97.30, 32.75],
            [-96.55, 32.75],
            [-96.55, 33.20],
            [-97.30, 33.20],
            [-97.30, 32.75],
        ]
    ],
}


def main() -> int:
    spec = json.loads(FIXTURES.read_text())
    med_spa = next(m for m in spec["markets"] if m["id"] == "med-spa-dallas")
    cats = med_spa["categories"]["primary"] + med_spa["categories"]["expanded"]

    con = connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    files = list_place_files(spec["overture_release"])

    print(f"Overture {spec['overture_release']}, {len(files)} place files")
    print(f"Categories: {', '.join(cats)}\n")

    regions = [
        (
            "radius 25mi",
            lambda: geometry.from_radius(
                med_spa["center"]["lat"], med_spa["center"]["lon"], 25, "Dallas, TX"
            ),
        ),
        (
            "radius 5mi",
            lambda: geometry.from_radius(
                med_spa["center"]["lat"], med_spa["center"]["lon"], 5, "Dallas, TX"
            ),
        ),
        ("city", lambda: geometry.from_division(con, "Dallas", "city", "US-TX")),
        (
            "county",
            lambda: geometry.from_division(con, "Dallas County", "county", "US-TX"),
        ),
        ("state", lambda: geometry.from_division(con, "Texas", "state", "US-TX")),
        ("drawn polygon", lambda: geometry.from_geojson(con, DRAWN_DFW, "North DFW")),
    ]

    rows = []
    for shape, build in regions:
        started = time.time()
        region = build()
        count = geometry.estimate_candidates(con, region, files, cats)
        elapsed = round(time.time() - started, 1)
        rows.append(
            {
                "shape": shape,
                "label": region.describe(),
                "candidates": count,
                "bbox_area_sq_miles": round(region.area_sq_miles),
                "seconds": elapsed,
            }
        )
        print(
            f"{shape:16} {region.describe():28} "
            f"{count:>7,} candidates  "
            f"~{round(region.area_sq_miles):>8,} sq mi  {elapsed:>5}s"
        )

    out = DATA / "region-shapes.json"
    out.write_text(json.dumps(rows, indent=2) + "\n")
    print(f"\nSummary → {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
