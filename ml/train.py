"""Train all three WattIf ML models and save artifacts to ml/models/.

Reproducible (fixed seed). Trains:
  1. demand_zone   — HistGradientBoostingRegressor, monthly zone demand (kWh)
  2. demand_agent  — HistGradientBoostingRegressor, monthly agent demand (kWh)
  3. adoption      — HistGradientBoostingClassifier, P(adopt solar/EV)
  4. cluster       — StandardScaler + KMeans, neighbourhood archetypes (equity)

Prints metrics: MAE/R^2 (demand), AUC (adoption), silhouette (clusters).

Usage:
    python -m ml.train            # from repo root
    python ml/train.py            # also works (path bootstrap below)
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np

# Allow running as a script (python ml/train.py) as well as a module.
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import joblib
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score, roc_auc_score, silhouette_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from ml import features as F
from ml import synth

SEED = 42
HERE = Path(__file__).resolve().parent
MODELS_DIR = HERE / "models"
PROCESSED_DIR = HERE.parent / "data" / "processed"


def _ohe() -> OneHotEncoder:
    return OneHotEncoder(handle_unknown="ignore", sparse_output=False)


def _regressor(numeric: list[str], categorical: list[str]) -> Pipeline:
    pre = ColumnTransformer(
        [("cat", _ohe(), categorical), ("num", "passthrough", numeric)],
        remainder="drop",
    )
    model = HistGradientBoostingRegressor(
        max_iter=400, learning_rate=0.06, max_depth=None, l2_regularization=1.0, random_state=SEED
    )
    return Pipeline([("pre", pre), ("model", model)])


def _classifier(numeric: list[str], categorical: list[str]) -> Pipeline:
    pre = ColumnTransformer(
        [("cat", _ohe(), categorical), ("num", "passthrough", numeric)],
        remainder="drop",
    )
    model = HistGradientBoostingClassifier(
        max_iter=300, learning_rate=0.07, l2_regularization=1.0, random_state=SEED
    )
    return Pipeline([("pre", pre), ("model", model)])


def _load_processed(name: str) -> list[dict] | None:
    path = PROCESSED_DIR / name
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
        if isinstance(data, list) and data:
            return data
    except (json.JSONDecodeError, OSError):
        pass
    return None


def _load_real_zones() -> list[dict] | None:
    return _load_processed("zones.json")


def _load_real_agents() -> list[dict] | None:
    return _load_processed("agents.json")


def _zone_solar_lookup(zones_raw: list[dict] | None) -> dict[str, float]:
    if not zones_raw:
        return {}
    out = {}
    for z in zones_raw:
        zn = F.normalize_zone(z)
        zid = F._field(z, "id")
        if zid is not None:
            out[zid] = zn["solar_potential"]
    return out


# --- real-fixture row builders (ground models in the real distribution) ------
def real_demand_zone_rows(zones_raw: list[dict], rng) -> tuple[pd.DataFrame, pd.Series]:
    """Per (real zone, month): target = real demandKwhMonthly * Toronto seasonality."""
    rows, targets = [], []
    for z in zones_raw:
        zn = F.normalize_zone(z)
        base = zn.get("demand_kwh_monthly")
        if not base or base <= 0:
            continue
        for m in range(1, 13):
            rows.append(F.demand_zone_row(zn, m))
            targets.append(max(base * F.seasonal_multiplier(m) * (1 + rng.normal(0, 0.03)), 1000.0))
    return pd.DataFrame(rows), pd.Series(targets, name="demand_kwh_monthly")


def real_demand_agent_rows(agents_raw, zsolar, rng, months_per_agent: int = 2):
    rows, targets = [], []
    for a in agents_raw:
        an = F.normalize_agent(a)
        base = an.get("demand_kwh")
        if not base or base <= 0:
            continue
        solar = float(zsolar.get(an.get("zone_id"), 0.5))
        for _ in range(months_per_agent):
            m = int(rng.integers(1, 13))
            rows.append(F.demand_agent_row(an, solar, m))
            targets.append(max(base * F.seasonal_multiplier(m) * (1 + rng.normal(0, 0.04)), 30.0))
    return pd.DataFrame(rows), pd.Series(targets, name="demand_kwh")


def real_adoption_rows(agents_raw, zsolar, rng, horizon: int = 24):
    """Real agent attributes + sampled policy/social context; label from the agents.py hazard."""
    rows, labels = [], []
    for a in agents_raw:
        an = F.normalize_agent(a)
        iw = an["income_weight"]
        solar = float(zsolar.get(an.get("zone_id"), 0.5))
        has_roof = an["has_rooftop"]
        neigh = float(rng.uniform(0.0, 0.6))
        incentive = float(rng.uniform(0.0, 1.0))
        tick = float(rng.integers(0, 60))
        trend = 1.0 + min(tick, 60.0) * 0.02
        boost = 0.5 * neigh + 0.5 * incentive
        p_solar = min(0.015 * iw * (0.4 + solar) * trend * (1 + 0.8 * boost), 0.25)
        p_ev = min(0.010 * iw * trend * (1 + 0.6 * incentive), 0.20)
        cum_solar = 1 - (1 - p_solar) ** horizon if has_roof else 0.0
        cum_ev = 1 - (1 - p_ev) ** horizon
        cum = 1 - (1 - cum_solar) * (1 - cum_ev)
        ctx = {"neighbourhood_adoption": neigh, "incentive_level": incentive,
               "solar_potential": solar, "tick": tick}
        rows.append(F.adoption_row(an, ctx))
        labels.append(1 if rng.random() < cum else 0)
    return pd.DataFrame(rows), pd.Series(labels, name="adopted")


# ---------------------------------------------------------------------------
def train_demand_zone(rng, real_zones=None) -> dict:
    df = synth.demand_zone_dataset(rng, n_zones=500)
    y = df.pop("__target")
    cols = F.DEMAND_ZONE_NUMERIC + F.DEMAND_ZONE_CATEGORICAL
    X = df[cols]
    n_real = 0
    if real_zones:
        Xr, yr = real_demand_zone_rows(real_zones, rng)
        n_real = len(Xr)
        X = pd.concat([X, Xr[cols]], ignore_index=True)
        y = pd.concat([y, yr], ignore_index=True)
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=SEED)
    pipe = _regressor(F.DEMAND_ZONE_NUMERIC, F.DEMAND_ZONE_CATEGORICAL)
    pipe.fit(Xtr, ytr)
    pred = pipe.predict(Xte)
    metrics = {
        "mae": float(mean_absolute_error(yte, pred)),
        "r2": float(r2_score(yte, pred)),
        "mae_pct_of_mean": float(mean_absolute_error(yte, pred) / yte.mean()),
        "n_rows": int(len(X)),
        "n_real_rows": n_real,
        "source": "real+synthetic" if n_real else "synthetic",
    }
    joblib.dump({"pipeline": pipe, "columns": cols}, MODELS_DIR / "demand_zone.joblib")
    return metrics


def train_demand_agent(rng, real_agents=None, zsolar=None) -> dict:
    df = synth.demand_agent_dataset(rng, n_agents=9000)
    y = df.pop("__target")
    cols = F.DEMAND_AGENT_NUMERIC + F.DEMAND_AGENT_CATEGORICAL
    X = df[cols]
    n_real = 0
    if real_agents:
        Xr, yr = real_demand_agent_rows(real_agents, zsolar or {}, rng)
        n_real = len(Xr)
        X = pd.concat([X, Xr[cols]], ignore_index=True)
        y = pd.concat([y, yr], ignore_index=True)
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=SEED)
    pipe = _regressor(F.DEMAND_AGENT_NUMERIC, F.DEMAND_AGENT_CATEGORICAL)
    pipe.fit(Xtr, ytr)
    pred = pipe.predict(Xte)
    metrics = {
        "mae": float(mean_absolute_error(yte, pred)),
        "r2": float(r2_score(yte, pred)),
        "mae_pct_of_mean": float(mean_absolute_error(yte, pred) / yte.mean()),
        "n_rows": int(len(X)),
        "n_real_rows": n_real,
        "source": "real+synthetic" if n_real else "synthetic",
    }
    joblib.dump({"pipeline": pipe, "columns": cols}, MODELS_DIR / "demand_agent.joblib")
    return metrics


def train_adoption(rng, real_agents=None, zsolar=None) -> dict:
    df = synth.adoption_dataset(rng, n_agents=12000)
    y = df.pop("__target")
    cols = F.ADOPTION_NUMERIC + F.ADOPTION_CATEGORICAL
    X = df[cols]
    n_real = 0
    if real_agents:
        Xr, yr = real_adoption_rows(real_agents, zsolar or {}, rng)
        n_real = len(Xr)
        X = pd.concat([X, Xr[cols]], ignore_index=True)
        y = pd.concat([y, yr], ignore_index=True)
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=SEED, stratify=y)
    pipe = _classifier(F.ADOPTION_NUMERIC, F.ADOPTION_CATEGORICAL)
    pipe.fit(Xtr, ytr)
    proba = pipe.predict_proba(Xte)[:, 1]
    metrics = {
        "auc": float(roc_auc_score(yte, proba)),
        "base_rate": float(y.mean()),
        "n_rows": int(len(X)),
        "n_real_rows": n_real,
        "source": "real+synthetic" if n_real else "synthetic",
    }
    joblib.dump({"pipeline": pipe, "columns": cols}, MODELS_DIR / "adoption.joblib")
    return metrics


def _label_clusters(centers: np.ndarray, cols: list[str]) -> dict[int, str]:
    """Assign a DISTINCT human archetype to each cluster by ranking centroids along
    an equity-vulnerability gradient (more burden + more renters - more income).

    Centroids are in original feature units. Returns one label per cluster, ordered
    least-vulnerable (affluent-owner) -> most-vulnerable (burdened-renter)."""
    inc = cols.index("median_income")
    burden = cols.index("energy_burden_index")
    renter = cols.index("renter_pct")

    def _z(col_idx):
        v = centers[:, col_idx]
        std = v.std() or 1.0
        return (v - v.mean()) / std

    vulnerability = _z(burden) + _z(renter) - _z(inc)
    order = np.argsort(vulnerability)  # ascending = least vulnerable first

    k = len(centers)
    ladder_4 = ["affluent-owner", "stable-mixed", "urban-renter", "burdened-renter"]
    if k == 4:
        ladder = ladder_4
    else:
        ladder = [f"archetype-{i}" for i in range(k)]
        if k >= 1:
            ladder[0] = "affluent-owner"
        if k >= 2:
            ladder[-1] = "burdened-renter"
    labels: dict[int, str] = {}
    for rank, cluster_id in enumerate(order):
        labels[int(cluster_id)] = ladder[rank]
    return labels


def train_cluster(rng, k: int = 4) -> dict:
    real = _load_real_zones()
    if real:
        rows = [F.cluster_row(F.normalize_zone(z)) for z in real]
        df = pd.DataFrame(rows)
        source = f"data/processed/zones.json ({len(df)} zones)"
    else:
        df = synth.cluster_dataset(rng, n_zones=500)
        source = "synthetic"
    cols = F.CLUSTER_FEATURES
    X = df[cols]
    scaler = StandardScaler().fit(X)
    Xs = scaler.transform(X)
    km = KMeans(n_clusters=k, n_init=10, random_state=SEED).fit(Xs)
    sil = float(silhouette_score(Xs, km.labels_))
    # centroids back in original feature units for labelling
    centers_orig = scaler.inverse_transform(km.cluster_centers_)
    labels = _label_clusters(centers_orig, cols)
    joblib.dump(
        {"scaler": scaler, "kmeans": km, "columns": cols, "labels": labels},
        MODELS_DIR / "cluster.joblib",
    )
    return {"silhouette": sil, "k": k, "labels": labels, "source": source, "n_rows": int(len(df))}


def main() -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    t0 = time.time()

    real_zones = _load_real_zones()
    real_agents = _load_real_agents()
    zsolar = _zone_solar_lookup(real_zones)
    data_src = "real+synthetic" if (real_zones or real_agents) else "synthetic-only"
    print(f"Training WattIf ML models (seed={SEED}, data={data_src})...")
    if real_zones:
        print(f"  real fixtures: {len(real_zones)} zones, {len(real_agents or [])} agents\n")
    else:
        print("  no data/processed fixtures found; using synthetic set\n")

    dz = train_demand_zone(rng, real_zones)
    print(f"[1/4] demand_zone   MAE={dz['mae']:.0f} kWh ({dz['mae_pct_of_mean']*100:.1f}% of mean)  R2={dz['r2']:.3f}  [{dz['source']}, {dz['n_real_rows']} real rows]")
    da = train_demand_agent(rng, real_agents, zsolar)
    print(f"[2/4] demand_agent  MAE={da['mae']:.1f} kWh ({da['mae_pct_of_mean']*100:.1f}% of mean)  R2={da['r2']:.3f}  [{da['source']}, {da['n_real_rows']} real rows]")
    ad = train_adoption(rng, real_agents, zsolar)
    print(f"[3/4] adoption      AUC={ad['auc']:.3f}  base_rate={ad['base_rate']:.3f}  [{ad['source']}, {ad['n_real_rows']} real rows]")
    cl = train_cluster(rng)
    print(f"[4/4] cluster       silhouette={cl['silhouette']:.3f}  k={cl['k']}  source={cl['source']}")
    print(f"      archetypes: {cl['labels']}")

    metadata = {
        "schema_version": 1,
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "seed": SEED,
        "sklearn_only": True,
        "data_source": data_src,
        "n_real_zones": len(real_zones or []),
        "n_real_agents": len(real_agents or []),
        "models": {
            "demand_zone": dz,
            "demand_agent": da,
            "adoption": ad,
            "cluster": cl,
        },
        "features": {
            "demand_zone": F.DEMAND_ZONE_NUMERIC + F.DEMAND_ZONE_CATEGORICAL,
            "demand_agent": F.DEMAND_AGENT_NUMERIC + F.DEMAND_AGENT_CATEGORICAL,
            "adoption": F.ADOPTION_NUMERIC + F.ADOPTION_CATEGORICAL,
            "cluster": F.CLUSTER_FEATURES,
        },
    }
    (MODELS_DIR / "metadata.json").write_text(json.dumps(metadata, indent=2))
    print(f"\nSaved artifacts to {MODELS_DIR}  ({time.time()-t0:.1f}s)")


if __name__ == "__main__":
    main()
