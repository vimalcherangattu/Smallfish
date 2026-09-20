/** Region geometry, mirroring `stage0/src/engine/geometry.py`.
 *
 *  The Python module is the source of truth for server-side queries; this is the
 *  browser half, so the count shown while dragging the map matches the count the
 *  engine would produce. Both do the same thing: cheap bounding-box reject first,
 *  exact test second.
 */

export const EARTH_RADIUS_MILES = 3958.8;
export const MILES_PER_DEG_LAT = 69.0;

export interface LngLat {
  lon: number;
  lat: number;
}

export type Region =
  | { kind: "radius"; center: LngLat; miles: number }
  | { kind: "polygon"; ring: LngLat[] };

export interface BBox {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

export function haversineMiles(a: LngLat, b: LngLat): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.asin(Math.sqrt(h));
}

export function bboxOf(region: Region): BBox {
  if (region.kind === "radius") {
    const dLat = region.miles / MILES_PER_DEG_LAT;
    const dLon =
      region.miles /
      (MILES_PER_DEG_LAT * Math.cos((region.center.lat * Math.PI) / 180));
    return {
      xmin: region.center.lon - dLon,
      xmax: region.center.lon + dLon,
      ymin: region.center.lat - dLat,
      ymax: region.center.lat + dLat,
    };
  }
  const lons = region.ring.map((p) => p.lon);
  const lats = region.ring.map((p) => p.lat);
  return {
    xmin: Math.min(...lons),
    xmax: Math.max(...lons),
    ymin: Math.min(...lats),
    ymax: Math.max(...lats),
  };
}

/** Ray casting. The ring may be open or closed; both are handled. */
export function pointInRing(p: LngLat, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lon;
    const yi = ring[i].lat;
    const xj = ring[j].lon;
    const yj = ring[j].lat;
    const intersects =
      yi > p.lat !== yj > p.lat &&
      p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function contains(region: Region, p: LngLat, box?: BBox): boolean {
  const b = box ?? bboxOf(region);
  // Bounding box first: rejects most points with four comparisons.
  if (p.lon < b.xmin || p.lon > b.xmax || p.lat < b.ymin || p.lat > b.ymax) {
    return false;
  }
  return region.kind === "radius"
    ? haversineMiles(region.center, p) <= region.miles
    : pointInRing(p, region.ring);
}

/** Bounding-box area, the same rough size signal `geometry.py` reports. */
export function areaSqMiles(region: Region): number {
  if (region.kind === "radius") return Math.PI * region.miles ** 2;
  const b = bboxOf(region);
  const midLat = (b.ymin + b.ymax) / 2;
  const height = (b.ymax - b.ymin) * MILES_PER_DEG_LAT;
  const width =
    (b.xmax - b.xmin) * MILES_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180);
  return Math.abs(height * width);
}

/** A circle as a polygon ring, for drawing the radius on the map. */
export function circleRing(center: LngLat, miles: number, steps = 96): LngLat[] {
  const dLat = miles / MILES_PER_DEG_LAT;
  const dLon = miles / (MILES_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180));
  const ring: LngLat[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    ring.push({
      lon: center.lon + dLon * Math.cos(t),
      lat: center.lat + dLat * Math.sin(t),
    });
  }
  return ring;
}

export function toGeoJsonPolygon(ring: LngLat[]) {
  const coords = ring.map((p) => [p.lon, p.lat]);
  if (
    coords.length &&
    (coords[0][0] !== coords[coords.length - 1][0] ||
      coords[0][1] !== coords[coords.length - 1][1])
  ) {
    coords.push(coords[0]);
  }
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Polygon" as const, coordinates: [coords] },
  };
}
