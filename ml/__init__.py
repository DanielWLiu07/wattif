"""WattIf ML package: demand forecast, adoption propensity, equity clustering.

Public surface (see ml/inference.py):
    from ml.inference import predict_demand, adoption_prob, zone_cluster
"""

from .inference import (
    adoption_prob,
    models_available,
    predict_demand,
    scenario_adoption,
    zone_cluster,
)

__all__ = [
    "predict_demand",
    "adoption_prob",
    "scenario_adoption",
    "zone_cluster",
    "models_available",
]
