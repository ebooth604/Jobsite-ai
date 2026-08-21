"""Scoring: run an estimator over a labelled set and report how wrong it was.

The reporting is deliberately unflattering. Three failure modes all look like
success if you only print an error rate:

1. Low error with a high abstention rate — the model answered only the easy
   frames. Coverage is reported alongside error for exactly this reason.
2. Low error on curated photographs — that measures the curator, not the model.
   The harness cannot detect this; ask how the set was built.
3. Beating the baseline by a little — the photographs may carry no signal.

A negative result here is cheap. The same result after building the product is
not, which is why this runs first (technical plan section 12).
"""

from __future__ import annotations

import statistics
from collections.abc import Sequence
from dataclasses import dataclass

from .estimators import MEASURABLE_ORIGINS, Estimate, Estimator, Sample

#: The bar the plan sets for one trade with human-corrected capture.
TARGET_MDAPE = 15.0

#: Below this, a low error rate reflects easy frames rather than a good model.
MIN_COVERAGE = 0.80


class SimulatedCaptureLeakError(Exception):
    """A simulated capture reached a set used to report accuracy.

    Simulated data may train a model and may never measure one. This is a hard
    failure rather than a warning, because a leaked simulated sample makes every
    number in the report meaningless while still looking entirely plausible.
    """


@dataclass(frozen=True)
class Outcome:
    sample_id: str
    actual_quantity: float
    estimate: Estimate

    @property
    def absolute_percentage_error(self) -> float | None:
        """None when the sample cannot be scored, rather than a misleading zero."""
        if self.estimate.abstained or self.estimate.quantity is None:
            return None
        if self.actual_quantity == 0:
            # An as-built of zero makes percentage error undefined rather than
            # infinite. Excluded from error stats, counted in coverage, and
            # reported separately so it cannot hide.
            return None
        return abs(self.estimate.quantity - self.actual_quantity) / self.actual_quantity * 100.0


@dataclass(frozen=True)
class EvaluationReport:
    estimator_name: str
    sample_count: int
    answered_count: int
    abstained_count: int
    zero_actual_count: int
    errors: tuple[float, ...]

    @property
    def coverage(self) -> float:
        return self.answered_count / self.sample_count if self.sample_count else 0.0

    @property
    def abstention_rate(self) -> float:
        return self.abstained_count / self.sample_count if self.sample_count else 0.0

    @property
    def median_absolute_percentage_error(self) -> float | None:
        return statistics.median(self.errors) if self.errors else None

    @property
    def mean_absolute_percentage_error(self) -> float | None:
        return statistics.fmean(self.errors) if self.errors else None

    @property
    def share_within_target(self) -> float | None:
        if not self.errors:
            return None
        return sum(1 for e in self.errors if e <= TARGET_MDAPE) / len(self.errors)

    @property
    def meets_bar(self) -> bool:
        """Both conditions, never just the flattering one."""
        mdape = self.median_absolute_percentage_error
        if mdape is None:
            return False
        return mdape <= TARGET_MDAPE and self.coverage >= MIN_COVERAGE

    def summary_lines(self) -> list[str]:
        lines = [
            f"estimator: {self.estimator_name}",
            f"samples:   {self.sample_count}",
            "-" * 52,
            f"answered:      {self.answered_count} ({self.coverage:.0%} coverage)",
            f"abstained:     {self.abstained_count} ({self.abstention_rate:.0%})",
        ]
        if self.zero_actual_count:
            lines.append(f"zero as-built: {self.zero_actual_count} (excluded from error stats)")

        mdape = self.median_absolute_percentage_error
        if mdape is None:
            lines += [
                "",
                "no scoreable estimates: every answer was an abstention or a zero as-built.",
            ]
            return lines

        mean = self.mean_absolute_percentage_error
        within = self.share_within_target
        assert mean is not None and within is not None
        lines += [
            "",
            f"median abs % error:  {mdape:.1f}%   (target <= {TARGET_MDAPE:.0f}%)",
            f"mean abs % error:    {mean:.1f}%",
            f"worst:               {max(self.errors):.1f}%",
            f"within +/-{TARGET_MDAPE:.0f}%:        {within:.0%} of answered samples",
            "-" * 52,
        ]

        if self.meets_bar:
            lines.append("MEETS THE BAR.")
            return lines

        lines.append("BELOW THE BAR.")
        if mdape > TARGET_MDAPE:
            lines.append(f"  - median error {mdape:.1f}% exceeds the {TARGET_MDAPE:.0f}% threshold")
        if self.coverage < MIN_COVERAGE:
            lines.append(
                f"  - coverage {self.coverage:.0%} is under {MIN_COVERAGE:.0%}; "
                "a low error rate here reflects easy frames, not a good model"
            )
        lines += [
            "",
            "See docs/decisions.md section 10. The kill criterion is there to be honoured.",
        ]
        return lines


def evaluate(estimator: Estimator, samples: Sequence[Sample]) -> EvaluationReport:
    """Score an estimator over a held-out set.

    Raises SimulatedCaptureLeakError before scoring anything if the set contains
    a simulated capture.
    """
    leaked = [s.sample_id for s in samples if s.origin not in MEASURABLE_ORIGINS]
    if leaked:
        raise SimulatedCaptureLeakError(
            f"{len(leaked)} non-measurable capture(s) in a measurement set: "
            f"{', '.join(leaked[:5])}"
            f"{' ...' if len(leaked) > 5 else ''}. "
            "Simulated data may train a model and may never measure one."
        )

    outcomes: list[Outcome] = []
    for sample in samples:
        try:
            estimate = estimator.estimate(sample)
        except Exception as exc:  # noqa: BLE001 - a crashing estimator is a result
            estimate = Estimate(
                quantity=None,
                confidence=0.0,
                abstained=True,
                note=f"estimator raised: {exc}",
            )
        outcomes.append(Outcome(sample.sample_id, sample.actual_quantity, estimate))

    errors = tuple(e for o in outcomes if (e := o.absolute_percentage_error) is not None)
    return EvaluationReport(
        estimator_name=estimator.name,
        sample_count=len(outcomes),
        answered_count=sum(1 for o in outcomes if not o.estimate.abstained),
        abstained_count=sum(1 for o in outcomes if o.estimate.abstained),
        zero_actual_count=sum(
            1 for o in outcomes if not o.estimate.abstained and o.actual_quantity == 0
        ),
        errors=errors,
    )
