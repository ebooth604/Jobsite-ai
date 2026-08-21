"""The accuracy harness — phase 0 of the build order.

The product rests on one unproven claim: that a model can estimate installed
quantities from the ad-hoc photos a foreman already takes. This package answers
that against real jobsite photos, and reports the answer in a form that is hard
to flatter.
"""

from .dataset import DatasetError, load_jsonl
from .estimators import BaselineEstimator, Estimate, Estimator, Sample, ScopeContext
from .harness import (
    MIN_COVERAGE,
    TARGET_MDAPE,
    EvaluationReport,
    Outcome,
    SimulatedCaptureLeakError,
    evaluate,
)

__all__ = [
    "MIN_COVERAGE",
    "TARGET_MDAPE",
    "BaselineEstimator",
    "DatasetError",
    "Estimate",
    "Estimator",
    "EvaluationReport",
    "Outcome",
    "Sample",
    "ScopeContext",
    "SimulatedCaptureLeakError",
    "evaluate",
    "load_jsonl",
]
