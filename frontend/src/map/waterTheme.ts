/** Previous land-focused soft gray water (recedes so land reads as focus). */
export const WATER_COLOR_GRAY = "#e3e9ee";

/** Cyan lake blue. */
export const WATER_COLOR_BLUE = "#B3CEE5";

/** Map background — Positron uses this as the land base (must stay light, not blue). */
export const MAP_BACKGROUND_COLOR = WATER_COLOR_GRAY;

/** Water fill/line layers only — set to WATER_COLOR_BLUE for blue lake. */
export const MAP_WATER_COLOR = WATER_COLOR_BLUE;

/** CARTO positron layers that represent actual water geometry. */
export const MAP_WATER_LAYER_IDS = new Set(["water", "water_shadow", "waterway"]);
