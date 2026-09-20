"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { Business } from "@/lib/types";
import {
  circleRing,
  toGeoJsonPolygon,
  type LngLat,
  type Region,
} from "@/lib/geo";

/** Free raster basemap. No token, no billing, no third-party key to manage —
 *  which is why this is MapLibre and not Google Maps or Mapbox. */
const BASEMAP: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors · Places © Overture Maps",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

const VERDICT_COLOR: Record<string, string> = {
  match: "#0f6d5f",
  no_match: "#8a8f9a",
  couldnt_tell: "#c9820f",
  blocked: "#c2566a",
  needs_model: "#6f7bd0",
  unread: "#b9bec7",
};

interface Props {
  businesses: Business[];
  region: Region;
  primaryCriterionId: string;
  onRegionChange: (region: Region) => void;
  drawing: boolean;
  onDrawComplete: () => void;
}

export default function MapPicker({
  businesses,
  region,
  primaryCriterionId,
  onRegionChange,
  drawing,
  onDrawComplete,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const draftRing = useRef<LngLat[]>([]);

  // Latest props for the map's event handlers, which are registered once.
  const live = useRef({ drawing, onRegionChange, onDrawComplete, region });
  live.current = { drawing, onRegionChange, onDrawComplete, region };

  // --- Create the map once -------------------------------------------------
  useEffect(() => {
    if (!container.current || map.current) return;

    const m = new maplibregl.Map({
      container: container.current,
      style: BASEMAP,
      center: [region.kind === "radius" ? region.center.lon : 0,
               region.kind === "radius" ? region.center.lat : 0],
      zoom: 9,
      attributionControl: { compact: true },
    });
    map.current = m;
    m.on("error", (e) => console.error("[maplibre]", e?.error?.message ?? e));
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    m.on("load", () => {
      m.addSource("businesses", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer({
        id: "businesses",
        type: "circle",
        source: "businesses",
        paint: {
          // Matches are drawn larger than the rest; an unread point still has to
          // be visible against a pale basemap, so it keeps a white ring.
          // Matches largest, then everything else we have read, then the
          // unread bulk kept deliberately faint — most of a cold market is
          // unread, and at equal weight it swamps the answer.
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            8, ["case", ["get", "isMatch"], 5, ["get", "isRead"], 3.5, 1.8],
            12, ["case", ["get", "isMatch"], 8, ["get", "isRead"], 5.5, 3],
            15, ["case", ["get", "isMatch"], 11, ["get", "isRead"], 8, 4.5],
          ],
          "circle-color": ["get", "color"],
          "circle-opacity": ["case", ["get", "isRead"], 0.95, 0.35],
          "circle-stroke-width": [
            "case", ["get", "isMatch"], 1.8, ["get", "isRead"], 0.8, 0,
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-opacity": 0.9,
        },
      });

      m.addSource("region", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer({
        id: "region-fill",
        type: "fill",
        source: "region",
        paint: { "fill-color": "#0f6d5f", "fill-opacity": 0.07 },
      });
      m.addLayer({
        id: "region-line",
        type: "line",
        source: "region",
        paint: {
          "line-color": "#0f6d5f",
          "line-width": 2,
          "line-dasharray": [2, 1.5],
        },
      });

      m.addSource("draft", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer({
        id: "draft-line",
        type: "line",
        source: "draft",
        paint: { "line-color": "#a8690b", "line-width": 2 },
      });
      m.addLayer({
        id: "draft-points",
        type: "circle",
        source: "draft",
        filter: ["==", "$type", "Point"],
        paint: {
          "circle-radius": 4,
          "circle-color": "#a8690b",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });

      ready.current = true;
      m.resize();
    });

    // Click: add a polygon vertex while drawing, otherwise recentre the radius.
    m.on("click", (e: maplibregl.MapMouseEvent) => {
      const { drawing: isDrawing, onRegionChange: change } = live.current;
      const p: LngLat = { lon: e.lngLat.lng, lat: e.lngLat.lat };
      if (isDrawing) {
        draftRing.current = [...draftRing.current, p];
        paintDraft(m, draftRing.current);
      } else if (live.current.region.kind === "radius") {
        change({ ...live.current.region, center: p });
      }
    });

    // Double-click or Enter closes the polygon.
    m.on("dblclick", (e: maplibregl.MapMouseEvent) => {
      if (!live.current.drawing) return;
      e.preventDefault();
      finishPolygon();
    });

    // MapLibre measures its container once, at construction. If layout has not
    // settled by then — a dynamic import, a font swap, a panel that grows — the
    // map keeps a stale size, and a zero-height container stays zero forever.
    // Watching the element is the only reliable fix; `resize()` on `load` is not,
    // because `load` waits on tiles that may be slow or blocked.
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(container.current);

    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      ready.current = false;
    };
    // Created once on purpose; later prop changes are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finishPolygon() {
    const ring = draftRing.current;
    if (ring.length >= 3) {
      live.current.onRegionChange({ kind: "polygon", ring });
    }
    draftRing.current = [];
    if (map.current) paintDraft(map.current, []);
    live.current.onDrawComplete();
  }

  // Enter finishes, Escape abandons.
  useEffect(() => {
    if (!drawing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") finishPolygon();
      if (e.key === "Escape") {
        draftRing.current = [];
        if (map.current) paintDraft(map.current, []);
        onDrawComplete();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing]);

  // Double-click zoom would fight the polygon-closing gesture.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (drawing) m.doubleClickZoom.disable();
    else m.doubleClickZoom.enable();
    m.getCanvas().style.cursor = drawing ? "crosshair" : "";
  }, [drawing]);

  // --- Keep the region outline in step -------------------------------------
  // Both data effects go through `whenReady`. Returning early when the style has
  // not loaded silently loses the update, because the effect does not re-run
  // when loading finishes — that is why the region outline never appeared.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    whenReady(m, ready, () => {
      const src = m.getSource("region") as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      const ring =
        region.kind === "radius"
          ? circleRing(region.center, region.miles)
          : region.ring;
      src.setData({
        type: "FeatureCollection",
        features: [toGeoJsonPolygon(ring)],
      });
    });
  }, [region]);

  // --- Plot the businesses --------------------------------------------------
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const paint = () => {
      const src = m.getSource("businesses") as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData({
        type: "FeatureCollection",
        features: businesses.map((b) => {
          const v = b.verdicts[primaryCriterionId]?.verdict ?? "unread";
          return {
            type: "Feature" as const,
            properties: {
              color: VERDICT_COLOR[v] ?? VERDICT_COLOR.unread,
              isRead: Boolean(b.read),
              isMatch: v === "match",
            },
            geometry: { type: "Point" as const, coordinates: [b.lon, b.lat] },
          };
        }),
      });
    };
    whenReady(m, ready, paint);
  }, [businesses, primaryCriterionId]);

  // Recentre when the market changes.
  useEffect(() => {
    const m = map.current;
    if (!m || region.kind !== "radius") return;
    m.easeTo({
      center: [region.center.lon, region.center.lat],
      duration: 600,
    });
    // Only on a market switch, which moves the centre a long way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region.kind === "radius" ? `${region.center.lat},${region.center.lon}` : ""]);

  // Sized explicitly, not with `absolute inset-0`: MapLibre's own stylesheet
  // sets `.maplibregl-map { position: relative }`, which wins over the utility
  // class and leaves `inset-0` inert — the div then collapses to zero height.
  return <div ref={container} className="h-full w-full" />;
}

/** Run now if the style is loaded, otherwise once it is. */
function whenReady(
  m: maplibregl.Map,
  ready: { current: boolean },
  fn: () => void,
) {
  if (ready.current) fn();
  else m.once("load", fn);
}

function paintDraft(m: maplibregl.Map, ring: LngLat[]) {
  const src = m.getSource("draft") as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  const features: GeoJSON.Feature[] = ring.map((p) => ({
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates: [p.lon, p.lat] },
  }));
  if (ring.length >= 2) {
    features.push({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [...ring, ring[0]].map((p) => [p.lon, p.lat]),
      },
    });
  }
  src.setData({ type: "FeatureCollection", features });
}
