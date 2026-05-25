"""Real-ish Toronto neighbourhood anchors: (name, lng, lat, income_tier 0..1, density 0..1).

income_tier and density are coarse hints used to make the synthetic demographics
plausible (e.g. Rosedale high-income low-density; Regent Park low-income high-density).
Centroids are approximate real coordinates.
"""

from __future__ import annotations

# name, lng, lat, income_tier (0 low .. 1 high), density (0 low .. 1 high)
NEIGHBOURHOODS: list[tuple[str, float, float, float, float]] = [
    ("Downtown Yonge", -79.3807, 43.6566, 0.55, 0.98),
    ("Financial District", -79.3806, 43.6480, 0.80, 0.90),
    ("Regent Park", -79.3607, 43.6595, 0.18, 0.85),
    ("St. Lawrence", -79.3700, 43.6490, 0.62, 0.80),
    ("Cabbagetown", -79.3650, 43.6670, 0.66, 0.55),
    ("The Annex", -79.4045, 43.6700, 0.70, 0.72),
    ("Kensington Market", -79.4005, 43.6545, 0.45, 0.78),
    ("Trinity Bellwoods", -79.4135, 43.6470, 0.60, 0.70),
    ("Liberty Village", -79.4200, 43.6385, 0.64, 0.88),
    ("Parkdale", -79.4360, 43.6390, 0.30, 0.75),
    ("High Park", -79.4660, 43.6465, 0.68, 0.45),
    ("Roncesvalles", -79.4500, 43.6490, 0.58, 0.60),
    ("Junction", -79.4690, 43.6655, 0.50, 0.55),
    ("Bloor West Village", -79.4840, 43.6500, 0.66, 0.48),
    ("Rosedale", -79.3780, 43.6800, 0.95, 0.30),
    ("Yorkville", -79.3915, 43.6710, 0.88, 0.70),
    ("Forest Hill", -79.4140, 43.6960, 0.92, 0.35),
    ("Davisville", -79.3880, 43.6980, 0.72, 0.65),
    ("Leaside", -79.3660, 43.7030, 0.82, 0.40),
    ("St. Clair West", -79.4180, 43.6810, 0.55, 0.62),
    ("Little Italy", -79.4190, 43.6545, 0.52, 0.68),
    ("Riverdale", -79.3530, 43.6680, 0.64, 0.58),
    ("Leslieville", -79.3360, 43.6630, 0.58, 0.62),
    ("The Beaches", -79.2980, 43.6710, 0.70, 0.45),
    ("East York", -79.3300, 43.6900, 0.46, 0.60),
    ("Thorncliffe Park", -79.3450, 43.7040, 0.22, 0.90),
    ("Don Mills", -79.3460, 43.7350, 0.60, 0.50),
    ("North York Centre", -79.4110, 43.7680, 0.58, 0.82),
    ("Willowdale", -79.4080, 43.7700, 0.62, 0.70),
    ("Scarborough Centre", -79.2580, 43.7740, 0.38, 0.72),
    ("Agincourt", -79.2860, 43.7900, 0.40, 0.58),
    ("Malvern", -79.2230, 43.8050, 0.28, 0.65),
    ("Etobicoke Centre", -79.5440, 43.6470, 0.50, 0.55),
    ("Rexdale", -79.5760, 43.7180, 0.26, 0.62),
    ("Mimico", -79.4980, 43.6160, 0.52, 0.58),
    ("Weston", -79.5180, 43.7000, 0.30, 0.60),
]
