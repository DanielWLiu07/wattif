import type { Polygon, MultiPolygon } from "geojson";
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

// One polygon = [outerRing, ...holes].
function inSinglePolygon(lng: number, lat: number, rings: number[][][]): boolean {
  if (!rings.length || !inRing(lng, lat, rings[0])) return false;
  for (let h = 1; h < rings.length; h++)
    if (inRing(lng, lat, rings[h])) return false; // holes
  return true;
}

// Normalize Polygon | MultiPolygon → list of polygons (each = ring[]).
function polygonsOf(geom: Polygon | MultiPolygon): number[][][][] {
  return geom.type === "MultiPolygon"
    ? (geom.coordinates as number[][][][])
    : [geom.coordinates as number[][][]];
}

function inGeometry(lng: number, lat: number, geom: Polygon | MultiPolygon): boolean {
  for (const rings of polygonsOf(geom))
    if (inSinglePolygon(lng, lat, rings)) return true;
  return false;
}

/**
 * Build a "is this point on land?" test that hides markers floating on Lake
 * Ontario WITHOUT over-clipping valid land between neighbourhood polygons.
 * Handles both Polygon and MultiPolygon (island) zone geometries.
 *
 * A point is land if it's inside any zone OR north of the local shoreline
 * (southernmost zone latitude near that longitude).
 */
export function makeLandTest(zones: Zone[]): (p: LngLat) => boolean {
  const boxes = zones.map((z) => {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const rings of polygonsOf(z.polygon))
      for (const [x, y] of rings[0] ?? []) {
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
    for (const b of boxes)
      if (lng >= b.minX - 0.01 && lng <= b.maxX + 0.01 && b.minY < minLat)
        minLat = b.minY;
    return minLat === Infinity ? globalMinLat : minLat;
  };

  return ([lng, lat]: LngLat) => {
    for (const b of boxes) {
      if (lng < b.minX || lng > b.maxX || lat < b.minY || lat > b.maxY) continue;
      if (inGeometry(lng, lat, b.z.polygon)) return true;
    }
    return lat >= shorelineAt(lng) - SHORE_BUFFER;
  };
}
