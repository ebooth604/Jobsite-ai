"""A deliberately dumb baseline that ignores the photographs entirely.

It guesses that a scope-day installed the average daily quantity implied by
the bid, assuming an 8-hour day and a two-person crew. It has no vision, no
model, and no idea what is actually on site.

Its only job is to be the number a real estimator must beat. If a vision
model cannot clear this comfortably, the photos are not carrying signal —
which is exactly the finding the spike exists to surface early.
"""

from __future__ import annotations

from .base import Estimate, Sample

ASSUMED_CREW_SIZE = 2
ASSUMED_SHIFT_HOURS = 8.0


class BaselineEstimator:
    name = "baseline"

    def estimate(self, sample: Sample) -> Estimate:
        scope = sample.scope
        if scope.budgeted_hours <= 0 or scope.budgeted_quantity <= 0:
            return Estimate(
                quantity=None,
                confidence=0.0,
                abstained=True,
                note="unusable bid: cannot infer a daily rate",
            )

        units_per_hour = scope.budgeted_quantity / scope.budgeted_hours
        crew_day_hours = ASSUMED_CREW_SIZE * ASSUMED_SHIFT_HOURS
        return Estimate(
            quantity=units_per_hour * crew_day_hours,
            confidence=0.2,
            note="bid-rate guess; ignores the photographs entirely",
        )
