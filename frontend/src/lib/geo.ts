import type { Polygon } from "geojson";
import type { LngLat, Zone } from "@/types";

// Ray-casting point-in-polygon over a single linear ring ([ [lng,lat], ... ]).
function inRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1];
    const xj = ring[j][0],
      yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function inPolygon(lng: number, lat: number, poly: Polygon): boolean {
  const rings = poly.coordinates;
  if (!rings.length) return false;
  if (!inRing(lng, lat, rings[0])) return false;
  for (let h = 1; h < rings.length; h++)
    if (inRing(lng, lat, rings[h])) return false;
  return true;
}

/**
 * Build a "is this point on land?" test that hides markers floating on Lake
 * Ontario WITHOUT over-clipping valid land between neighbourhood polygons.
 *
 * A point is land if it's inside any zone OR north of the local shoreline
 * (the southernmost zone latitude near that longitude). Only points that are
 * both outside every zone AND south of the shoreline (i.e. in the lake) are
 * dropped — so gaps between tracked zones still keep their markers.
 */
export function makeLandTest(zones: Zone[]): (p: LngLat) => boolean {
  const boxes = zones.map((z) => {
    const ring = z.polygon.coordinates[0] ?? [];
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return { z, minX, minY, maxX, maxY };
  });
  const globalMinLat = Math.min(...boxes.map((b) => b.minY));
  const SHORE_BUFFER = 0.004; // ~400m grace below the shoreline

  const shorelineAt = (lng: number): number => {
    let minLat = Infinity;
    for (const b of boxes) {
      if (lng >= b.minX - 0.01 && lng <= b.maxX + 0.01) {
        if (b.minY < minLat) minLat = b.minY;
      }
    }
    return minLat === Infinity ? globalMinLat : minLat;
  };

  return ([lng, lat]: LngLat) => {
    // inside any zone bbox → cheap PIP confirm
    for (const b of boxes) {
      if (lng < b.minX || lng > b.maxX || lat < b.minY || lat > b.maxY) continue;
      if (inPolygon(lng, lat, b.z.polygon)) return true;
    }
    // otherwise: keep if north of the local shoreline (land/gap), drop if south (lake)
    return lat >= shorelineAt(lng) - SHORE_BUFFER;
  };
}
