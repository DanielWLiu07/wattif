// Real Toronto stat highlights for the landing-page narrative.
// Generated from data/processed/*.json (the data lane). Figures are labelled by `basis`:
//   "real"    — taken directly from an authoritative dataset (City of Toronto / OSM / IESO)
//   "derived" — computed from real data (e.g. a median, a sum, an index from Census inputs)
//   "modeled" — an estimate from a documented model (clearly not a measured figure)
// Keep this honest: only `real`/`derived` figures should headline; `modeled` ones must read as estimates.

export type StatBasis = "real" | "derived" | "modeled";

export interface LandingStat {
  key: string;
  value: string; // formatted for display
  raw: number; // underlying number
  unit?: string;
  label: string; // short headline label
  detail: string; // one-line caption
  source: string; // provenance
  basis: StatBasis;
}

export const landingStats: LandingStat[] = [
  {
    key: "neighbourhoods",
    value: "140",
    raw: 140,
    label: "Toronto neighbourhoods",
    detail: "Every official City of Toronto neighbourhood — full-city coverage, no gaps.",
    source: "Toronto Open Data — Neighbourhoods (140 model)",
    basis: "real",
  },
  {
    key: "population",
    value: "2.73M",
    raw: 2731571,
    label: "Toronto residents",
    detail: "2.73 million Torontonians across all 140 neighbourhoods.",
    source: "2016 Census (Toronto Neighbourhood Profiles)",
    basis: "real",
  },
  {
    key: "buildings",
    value: "419,582",
    raw: 419582,
    label: "buildings mapped",
    detail: "Real building footprints used for rooftop-solar and density estimates.",
    source: "OpenStreetMap (Overpass) — 132/140 zones with storey heights too",
    basis: "real",
  },
  {
    key: "medianIncome",
    value: "$68,301",
    raw: 68301,
    label: "median household income",
    detail: "Median of neighbourhood median household incomes (range $43k–$209k).",
    source: "2016 Census — household income groups, grouped median",
    basis: "derived",
  },
  {
    key: "renterShare",
    value: "46%",
    raw: 45.5,
    unit: "%",
    label: "of households rent",
    detail: "Population-weighted renter share — the core of the energy-equity story.",
    source: "2016 Census — household tenure",
    basis: "derived",
  },
  {
    key: "highBurdenZones",
    value: "113",
    raw: 113,
    label: "high energy-burden areas",
    detail:
      "Of 140 neighbourhoods, 113 carry an above-baseline energy burden (index ≥ 0.6) — low income + high renter share.",
    source: "Derived from 2016 Census income + tenure (energyBurdenIndex)",
    basis: "derived",
  },
  {
    key: "avgBurden",
    value: "0.67",
    raw: 0.67,
    label: "average energy-burden index",
    detail: "City-wide mean energy-burden index (0–1; median 0.69) — broad, not isolated, need.",
    source: "Derived from 2016 Census income + tenure",
    basis: "derived",
  },
  {
    key: "facilities",
    value: "583",
    raw: 583,
    label: "cooling & relief sites",
    detail: "12 cooling centres, 452 cooling locations, 17 pools, 102 library branches.",
    source: "Toronto Heat Relief Network + Toronto Public Library",
    basis: "real",
  },
  {
    key: "existingInfra",
    value: "182",
    raw: 182,
    label: "existing clean-energy assets",
    detail: "100 city renewable-energy installations + 82 city-operated EV charging stations.",
    source: "Toronto Open Data — Renewable Energy Installations + EV Charging",
    basis: "real",
  },
  {
    key: "gridIntensity",
    value: "38",
    raw: 38,
    unit: "gCO₂/kWh",
    label: "Ontario grid intensity",
    detail: "Ontario's grid is ~89% non-emitting — so building gas heating, not power, drives emissions.",
    source: "IESO — 2023 generation mix",
    basis: "real",
  },
  {
    key: "cityEmissions",
    value: "16 Mt",
    raw: 16.0,
    unit: "Mt CO₂e",
    label: "city-wide emissions",
    detail: "57% from buildings — the biggest decarbonization lever.",
    source: "City of Toronto Sector-Based Emissions Inventory / TransformTO",
    basis: "real",
  },
  {
    key: "floodZones",
    value: "50",
    raw: 50,
    label: "flood-risk neighbourhoods",
    detail: "Areas overlapping chronic basement-flooding study areas.",
    source: "Toronto Open Data — Basement Flooding Study Areas",
    basis: "real",
  },
  {
    key: "agents",
    value: "8,001",
    raw: 8001,
    label: "simulated residents",
    detail: "Agents distributed across the 140 zones by real population (~57/zone).",
    source: "Modelled from Census population + archetype mix",
    basis: "modeled",
  },
  // --- Modelled estimates (must read as estimates, not measurements) ---
  {
    key: "monthlyDemand",
    value: "825 GWh",
    raw: 825,
    unit: "GWh/month",
    label: "modelled monthly demand",
    detail: "Baseline residential electricity demand across all 140 zones (~9.9 TWh/yr).",
    source: "Modelled: population × Ontario seasonal load curve",
    basis: "modeled",
  },
  {
    key: "avgSolarPotential",
    value: "47%",
    raw: 47,
    unit: "%",
    label: "average rooftop solar potential",
    detail: "Mean per-zone solar-potential score (irradiance × usable roof) — 0–100%.",
    source: "Derived: real OSM roof availability × PVGIS irradiance",
    basis: "derived",
  },
  {
    key: "solarPotentialCapacity",
    value: "~5.4 GW",
    raw: 5363,
    unit: "MW",
    label: "rooftop solar potential",
    detail: "Estimated installable rooftop PV from real building footprints × usable-roof factor.",
    source: "Estimated: real OSM roof area × solarPotential × 0.16 kW/m²",
    basis: "modeled",
  },
  {
    key: "solarPotentialGeneration",
    value: "~6.7 TWh",
    raw: 6.74,
    unit: "TWh/yr",
    label: "potential solar generation",
    detail: "If that rooftop potential were built — ~68% of modelled residential demand.",
    source: "Estimated: rooftop capacity × real PVGIS yield",
    basis: "modeled",
  },
];

// Suggested hero stats for the landing "road" sections (punchy, all real/derived).
export const heroStatKeys = [
  "neighbourhoods",
  "population",
  "buildings",
  "highBurdenZones",
  "gridIntensity",
  "facilities",
] as const;

export const heroStats = heroStatKeys.map(
  (k) => landingStats.find((s) => s.key === k)!,
);
