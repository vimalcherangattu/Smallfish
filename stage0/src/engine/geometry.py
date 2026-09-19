"""Location geometry for searches (task S0-29).

The product document names five location shapes in a single half-sentence — city,
radius, county, state and drawn polygon — with no further detail anywhere. They all
reduce to one thing the rest of the system needs: **a region that can filter
candidates and report how many there are before anything is spent.**

That count is the point. Region size is the main driver of scan cost, so the
geometry layer has to answer "how big is this?" as cheaply as it answers "what is
inside it?". A user who draws a box over half a state must be told the number
before an unlock, not after.

Two filtering strategies, both fast:

- **Radius** filters by bounding box (row-group pruning in the parquet) then by exact
  haversine distance. No geometry engine needed.
- **Polygon and division** filter by bounding box, then `ST_Within` against the real
  boundary. Division boundaries come from Overture Divisions, so there is no new data
  source to license or maintain, and they are cached locally after first use.

Usage:
    python3 stage0/src/coverage/region_demo.py
"""

from __future__ import annotations

import json
import math
import re
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / "stage0" / "data" / "cache"

S3_BASE = "https://overturemaps-us-west-2.s3.amazonaws.com/"
DEFAULT_RELEASE = "2026-08-19.0"
MILES_PER_DEG_LAT = 69.0
EARTH_RADIUS_MILES = 3958.8

# Overture division subtypes, mapped to the words the product document uses.
DIVISION_SUBTYPES = {
    "city": "locality",
    "locality": "locality",
    "town": "locality",
    "county": "county",
    "state": "region",
    "region": "region",
    "neighborhood": "neighborhood",
}


@dataclass(frozen=True)
class BBox:
    xmin: float
    xmax: float
    ymin: float
    ymax: float

    def sql(self, alias: str = "") -> str:
        p = f"{alias}." if alias else ""
        return (
            f"{p}bbox.xmin BETWEEN {self.xmin} AND {self.xmax} "
            f"AND {p}bbox.ymin BETWEEN {self.ymin} AND {self.ymax}"
        )


@dataclass
class Region:
    """A search area, whatever shape the user chose to express it in."""

    kind: str  # "radius" | "polygon" | "division"
    label: str
    bbox: BBox
    # radius only
    center_lat: float | None = None
    center_lon: float | None = None
    radius_miles: float | None = None
    # polygon and division only: a DuckDB-readable parquet holding one geometry
    boundary_path: Path | None = None

    @property
    def area_sq_miles(self) -> float:
        """Bounding-box area. A rough size signal, not the true polygon area."""
        if self.kind == "radius" and self.radius_miles is not None:
            return math.pi * self.radius_miles**2
        mid_lat = (self.bbox.ymin + self.bbox.ymax) / 2
        height = (self.bbox.ymax - self.bbox.ymin) * MILES_PER_DEG_LAT
        width = (
            (self.bbox.xmax - self.bbox.xmin)
            * MILES_PER_DEG_LAT
            * math.cos(math.radians(mid_lat))
        )
        return abs(height * width)

    def distance_sql(self, lat_col: str = "lat", lon_col: str = "lon") -> str | None:
        """Exact haversine distance expression, for radius regions only."""
        if self.kind != "radius":
            return None
        return (
            f"{EARTH_RADIUS_MILES} * 2 * ASIN(SQRT("
            f"POW(SIN(RADIANS({lat_col} - {self.center_lat}) / 2), 2)"
            f" + COS(RADIANS({self.center_lat})) * COS(RADIANS({lat_col}))"
            f" * POW(SIN(RADIANS({lon_col} - {self.center_lon}) / 2), 2)))"
        )

    def describe(self) -> str:
        if self.kind == "radius":
            return f"{self.label} ({self.radius_miles:g} mi radius)"
        return f"{self.label} ({self.kind})"


# --- Constructors ------------------------------------------------------------


def from_radius(lat: float, lon: float, miles: float, label: str) -> Region:
    dlat = miles / MILES_PER_DEG_LAT
    dlon = miles / (MILES_PER_DEG_LAT * math.cos(math.radians(lat)))
    return Region(
        kind="radius",
        label=label,
        bbox=BBox(lon - dlon, lon + dlon, lat - dlat, lat + dlat),
        center_lat=lat,
        center_lon=lon,
        radius_miles=miles,
    )


def from_geojson(
    con: duckdb.DuckDBPyConnection, geojson: dict | str, label: str = "Drawn area"
) -> Region:
    """A polygon the user drew on the map.

    Accepts a Feature, a FeatureCollection or a bare geometry, which is what the
    common map-drawing libraries emit.
    """
    raw = geojson if isinstance(geojson, str) else json.dumps(geojson)
    obj = json.loads(raw)
    if obj.get("type") == "FeatureCollection":
        features = obj.get("features") or []
        if not features:
            raise ValueError("FeatureCollection has no features")
        obj = features[0]
    if obj.get("type") == "Feature":
        obj = obj["geometry"]

    con.execute("INSTALL spatial; LOAD spatial;")
    CACHE.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-") or "drawn"
    out = CACHE / f"boundary-{safe}.parquet"

    con.execute(
        "CREATE OR REPLACE TEMP TABLE _drawn AS "
        "SELECT ST_GeomFromGeoJSON(?) AS geometry",
        [json.dumps(obj)],
    )
    xmin, xmax, ymin, ymax = con.execute(
        "SELECT ST_XMin(geometry), ST_XMax(geometry), "
        "ST_YMin(geometry), ST_YMax(geometry) FROM _drawn"
    ).fetchone()
    con.execute(f"COPY _drawn TO '{out}' (FORMAT PARQUET)")

    return Region(
        kind="polygon",
        label=label,
        bbox=BBox(xmin, xmax, ymin, ymax),
        boundary_path=out,
    )


def _division_files(release: str) -> list[str]:
    prefix = f"release/{release}/theme=divisions/type=division_area/"
    url = (
        f"{S3_BASE}?list-type=2&prefix={urllib.parse.quote(prefix, safe='')}"
        "&max-keys=1000"
    )
    with urllib.request.urlopen(url, timeout=60) as resp:
        xml = resp.read().decode()
    keys = [k for k in re.findall(r"<Key>([^<]+)</Key>", xml) if k.endswith(".parquet")]
    return [S3_BASE + k.replace("=", "%3D") for k in keys]


def from_division(
    con: duckdb.DuckDBPyConnection,
    name: str,
    kind: str,
    region_code: str | None = None,
    country: str = "US",
    release: str = DEFAULT_RELEASE,
) -> Region:
    """Resolve a named city, county or state to its real boundary.

    `region_code` is the ISO subdivision ("US-TX"). It matters: there are Dallases
    in several states, and picking the wrong one silently searches the wrong place.
    Boundaries are cached locally after the first lookup.
    """
    subtype = DIVISION_SUBTYPES.get(kind.lower())
    if subtype is None:
        raise ValueError(
            f"Unknown division kind {kind!r}; expected one of {sorted(DIVISION_SUBTYPES)}"
        )

    CACHE.mkdir(parents=True, exist_ok=True)
    slug = re.sub(r"[^a-z0-9]+", "-", f"{country}-{region_code or 'any'}-{subtype}-{name}".lower())
    out = CACHE / f"division-{slug.strip('-')}.parquet"

    con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;")
    con.execute("SET enable_progress_bar=false; SET http_timeout=120000;")

    if not out.exists():
        files = ", ".join(f"'{u}'" for u in _division_files(release))
        where = [
            f"country = '{country}'",
            f"subtype = '{subtype}'",
            "lower(names.primary) = lower(?)",
        ]
        params: list = [name]
        if region_code:
            where.append(f"region = '{region_code}'")
        con.execute(
            f"""
            COPY (
                SELECT geometry, names.primary AS name, subtype, region,
                       bbox, ST_Area(geometry) AS area_deg2
                FROM read_parquet([{files}])
                WHERE {' AND '.join(where)}
                ORDER BY area_deg2 DESC
                LIMIT 1
            ) TO '{out}' (FORMAT PARQUET)
            """,
            params,
        )

    row = con.execute(
        f"SELECT name, bbox.xmin, bbox.xmax, bbox.ymin, bbox.ymax "
        f"FROM read_parquet('{out}')"
    ).fetchone()
    if row is None:
        out.unlink(missing_ok=True)
        where_desc = f"{name}, {kind}"
        if region_code:
            where_desc += f", {region_code}"
        raise LookupError(f"No division found for {where_desc}")

    found, xmin, xmax, ymin, ymax = row
    return Region(
        kind="division",
        label=f"{found}" + (f", {region_code}" if region_code else ""),
        bbox=BBox(xmin, xmax, ymin, ymax),
        boundary_path=out,
    )


# --- Querying ----------------------------------------------------------------


def candidates_sql(
    region: Region,
    place_files: list[str],
    categories: list[str] | None = None,
    select: str = "*",
) -> str:
    """Build the SQL that selects places inside the region.

    Both strategies lead with the bounding box so the parquet reader can skip row
    groups; the exact test only runs on what survives.
    """
    files = ", ".join(f"'{u}'" for u in place_files)
    where = [region.bbox.sql("p")]
    if categories:
        cats = ", ".join(f"'{c}'" for c in categories)
        where.append(f"p.categories.primary IN ({cats})")

    if region.kind == "radius":
        distance = region.distance_sql("ST_Y(p.geometry)", "ST_X(p.geometry)")
        return f"""
        SELECT {select}, {distance} AS distance_miles
        FROM read_parquet([{files}]) p
        WHERE {' AND '.join(where)}
          AND {distance} <= {region.radius_miles}
        """

    if region.boundary_path is None:
        raise ValueError(f"{region.kind} region has no boundary geometry")
    return f"""
    SELECT {select}
    FROM read_parquet([{files}]) p,
         read_parquet('{region.boundary_path}') b
    WHERE {' AND '.join(where)}
      AND ST_Within(p.geometry, b.geometry)
    """


def estimate_candidates(
    con: duckdb.DuckDBPyConnection,
    region: Region,
    place_files: list[str],
    categories: list[str] | None = None,
) -> int:
    """How many candidates the region contains.

    This is the number the map picker shows as the user drags, and the number the
    cost guardrail (S1-21) acts on, so it runs before anything is charged.
    """
    con.execute("INSTALL spatial; LOAD spatial;")
    inner = candidates_sql(region, place_files, categories, select="1 AS one")
    return con.execute(f"SELECT count(*) FROM ({inner})").fetchone()[0]
