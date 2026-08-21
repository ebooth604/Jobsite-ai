"""The estimator interface, and a baseline that must be beaten.

Every approach — a hosted multimodal model, a fine-tuned detector, a human
benchmark — implements this protocol, so the harness can compare them on equal
terms.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Protocol

CaptureOrigin = Literal["field", "self_measured", "simulated"]

#: Origins admissible in a held-out set used to report accuracy. Mirrors
#: MEASURABLE_ORIGINS in packages/shared-types — simulated captures may train a
#: model and may never measure one (technical plan sections 5.4d and 11).
MEASURABLE_ORIGINS: frozenset[CaptureOrigin] = frozenset({"field", "self_measured"})


@dataclass(frozen=True)
class ScopeContext:
    """What the estimator knows about the scope item besides the photographs."""

    scope_item_id: str
    trade: str
    description: str
    unit_of_measure: str
    bid_quantity: float
    bid_hours: float

    @property
    def budgeted_units_per_hour(self) -> float | None:
        """The bid rate, or None when the bid cannot support one."""
        if self.bid_hours <= 0 or self.bid_quantity <= 0:
            return None
        return self.bid_quantity / self.bid_hours


@dataclass(frozen=True)
class Sample:
    """One labelled scope-day: photographs in, a known installed quantity out."""

    sample_id: str
    scope: ScopeContext
    work_date: str
    #: Ground truth, from as-built records. The whole point of the exercise.
    actual_quantity: float
    image_paths: tuple[str, ...] = ()
    #: Origin of the captures behind this sample. Checked before scoring.
    origin: CaptureOrigin = "field"
    metadata: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class Estimate:
    """An estimator's answer, including the option not to answer.

    Abstention is not a failure mode. Below the confidence threshold the answer
    becomes a 30-second foreman prompt rather than a silent guess, and an
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
            raise ValueError("a reported estimate must carry a quantity")
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError(f"confidence must be in [0, 1], got {self.confidence}")


class Estimator(Protocol):
    """Anything that turns photographs plus scope context into a quantity."""

    name: str

    def estimate(self, sample: Sample) -> Estimate: ...


ASSUMED_CREW_SIZE = 2
ASSUMED_SHIFT_HOURS = 8.0


class BaselineEstimator:
    """A deliberately dumb baseline that ignores the photographs entirely.

    It assumes the crew installed the daily quantity the bid implies, for a
    two-person crew on an eight-hour shift. No vision, no model, no idea what is
    actually on site.

    Its only job is to be the number a real estimator must beat. An estimator
    that barely clears this has not demonstrated that the photographs carry
    signal — which is exactly the finding the spike exists to surface early,
    while it is still cheap.
    """

    name = "baseline"

    def estimate(self, sample: Sample) -> Estimate:
        rate = sample.scope.budgeted_units_per_hour
        if rate is None:
            return Estimate(
                quantity=None,
                confidence=0.0,
                abstained=True,
                note="unusable bid: cannot infer a daily rate",
            )
        return Estimate(
            quantity=rate * ASSUMED_CREW_SIZE * ASSUMED_SHIFT_HOURS,
            confidence=0.2,
            note="bid-rate guess; ignores the photographs entirely",
        )
