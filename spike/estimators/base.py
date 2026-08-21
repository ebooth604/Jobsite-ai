"""The estimator interface.

Every approach — a hosted multimodal model, a fine-tuned detector, a human
baseline — implements this, so the harness can compare them on equal terms.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, Sequence


@dataclass(frozen=True)
class ScopeContext:
    """What the estimator knows about the scope item besides the photos."""

    scope_item_id: str
    trade: str
    description: str
    unit: str
    budgeted_quantity: float
    budgeted_hours: float


@dataclass(frozen=True)
class Sample:
    """One labelled scope-day: photos in, a known installed quantity out."""

    sample_id: str
    scope: ScopeContext
    image_paths: Sequence[str]
    observed_on: str
    #: Ground truth, from as-built records. The whole point of the exercise.
    actual_quantity: float


@dataclass(frozen=True)
class Estimate:
    """An estimator's answer, including the option not to answer.

    `abstained=True` is a legitimate, useful outcome — it becomes a request
    for 30 seconds of foreman input rather than a silent wrong number. An
    estimator that never abstains is not being honest about hard frames.
    """

    quantity: float | None
    confidence: float
    abstained: bool = False
    note: str = ""

    def __post_init__(self) -> None:
        if self.abstained and self.quantity is not None:
            raise ValueError("an abstention must not carry a quantity")
        if not self.abstained and self.quantity is None:
            raise ValueError("a non-abstention must carry a quantity")
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError(f"confidence must be in [0, 1], got {self.confidence}")


class Estimator(Protocol):
    """Anything that turns photos plus scope context into a quantity."""

    name: str

    def estimate(self, sample: Sample) -> Estimate: ...
