"""Local detection that proposes labels for a human to correct.

Not a model the product ships, and not `services/quantity-ml` — see `detect` for
why that distinction is load-bearing. Everything here runs on one machine.
"""

from .detect import (
    DEFAULT_WEIGHTS,
    PERSON_CLASSES,
    Detection,
    DetectionResult,
    ModelUnavailable,
    detect,
    model_identity,
)
from .segment import DEFAULT_SEG_WEIGHTS, SegmentResult, segment, segmentation_available
from .server import serve

__all__ = [
    "DEFAULT_WEIGHTS",
    "PERSON_CLASSES",
    "Detection",
    "DetectionResult",
    "ModelUnavailable",
    "detect",
    "model_identity",
    "DEFAULT_SEG_WEIGHTS",
    "SegmentResult",
    "segment",
    "segmentation_available",
    "serve",
]
