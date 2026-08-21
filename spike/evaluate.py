#!/usr/bin/env python3
"""Accuracy harness for quantity estimation.

Runs an estimator over a labelled set of scope-days and reports how wrong it
was — including the things it is tempting to leave out. See spike/README.md
for how to read the result honestly.

    python evaluate.py --dataset data/electrical_roughin_v1.jsonl --estimator baseline
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

from estimators.base import Estimate, Estimator, Sample, ScopeContext
from estimators.baseline import BaselineEstimator

ESTIMATORS: dict[str, type] = {
    "baseline": BaselineEstimator,
}

#: The bar the plan sets for one trade with human-corrected capture.
TARGET_MDAPE = 15.0
#: Below this, the estimator answered only the easy frames.
MIN_COVERAGE = 0.80


@dataclass
class Outcome:
    sample_id: str
    actual: float
    estimate: Estimate

    @property
    def abs_pct_error(self) -> float | None:
        if self.estimate.abstained or self.estimate.quantity is None:
            return None
        if self.actual == 0:
            # An as-built of zero makes percentage error undefined rather
            # than infinite. Excluded from the error stats, counted in
            # coverage, and reported separately so it cannot hide.
            return None
        return abs(self.estimate.quantity - self.actual) / self.actual * 100.0


def load_dataset(path: Path) -> list[Sample]:
    """Read a JSONL labelled set. One scope-day per line."""
    if not path.exists():
        raise FileNotFoundError(
            f"no dataset at {path}.\n"
            "The harness needs real jobsite photos with matching as-built "
            "quantities and bid takeoffs — see spike/README.md. Nothing here "
            "works without them, and synthesizing them would only measure "
            "our own assumptions."
        )

    samples: list[Sample] = []
    for line_no, line in enumerate(path.read_text().splitlines(), start=1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            raw = json.loads(line)
            scope = raw["scope"]
            samples.append(
                Sample(
                    sample_id=raw["sample_id"],
                    scope=ScopeContext(
                        scope_item_id=scope["scope_item_id"],
                        trade=scope["trade"],
                        description=scope["description"],
                        unit=scope["unit"],
                        budgeted_quantity=float(scope["budgeted_quantity"]),
                        budgeted_hours=float(scope["budgeted_hours"]),
                    ),
                    image_paths=raw.get("image_paths", []),
                    observed_on=raw["observed_on"],
                    actual_quantity=float(raw["actual_quantity"]),
                )
            )
        except (KeyError, ValueError) as exc:
            raise ValueError(f"{path}:{line_no}: malformed sample — {exc}") from exc
    return samples


def evaluate(estimator: Estimator, samples: Sequence[Sample]) -> list[Outcome]:
    outcomes: list[Outcome] = []
    for sample in samples:
        try:
            estimate = estimator.estimate(sample)
        except Exception as exc:  # noqa: BLE001 — a crash is a result too
            estimate = Estimate(
                quantity=None, confidence=0.0, abstained=True, note=f"estimator raised: {exc}"
            )
        outcomes.append(Outcome(sample.sample_id, sample.actual_quantity, estimate))
    return outcomes


def report(estimator_name: str, outcomes: Sequence[Outcome]) -> int:
    """Print the result. Returns a process exit code: 0 if the bar was met."""
    total = len(outcomes)
    if total == 0:
        print("no samples — nothing to report")
        return 1

    abstentions = sum(1 for o in outcomes if o.estimate.abstained)
    errors = [e for o in outcomes if (e := o.abs_pct_error) is not None]
    zero_actuals = sum(
        1 for o in outcomes if not o.estimate.abstained and o.actual == 0
    )
    answered = total - abstentions
    coverage = answered / total

    print(f"\nestimator: {estimator_name}")
    print(f"samples:   {total}")
    print("-" * 52)
    print(f"answered:      {answered} ({coverage:.0%} coverage)")
    print(f"abstained:     {abstentions} ({abstentions / total:.0%})")
    if zero_actuals:
        print(f"zero as-built: {zero_actuals} (excluded from error stats)")

    if not errors:
        print("\nno scoreable estimates — every answer was an abstention or a zero as-built.")
        return 1

    mdape = statistics.median(errors)
    print(f"\nmedian abs % error:  {mdape:.1f}%   (target ≤ {TARGET_MDAPE:.0f}%)")
    print(f"mean abs % error:    {statistics.fmean(errors):.1f}%")
    if len(errors) > 1:
        print(f"90th percentile:     {sorted(errors)[int(len(errors) * 0.9)]:.1f}%")
    print(f"worst:               {max(errors):.1f}%")
    within_15 = sum(1 for e in errors if e <= 15.0) / len(errors)
    print(f"within ±15%:         {within_15:.0%} of answered samples")

    print("-" * 52)
    passed = mdape <= TARGET_MDAPE and coverage >= MIN_COVERAGE
    if passed:
        print("MEETS THE BAR.")
    else:
        print("BELOW THE BAR.")
        if mdape > TARGET_MDAPE:
            print(f"  · median error {mdape:.1f}% exceeds the {TARGET_MDAPE:.0f}% threshold")
        if coverage < MIN_COVERAGE:
            print(
                f"  · coverage {coverage:.0%} is under {MIN_COVERAGE:.0%} — "
                "a low error rate here reflects easy frames, not a good model"
            )
        print("\nSee docs/decisions.md §10. The kill criterion is there to be honoured.")
    return 0 if passed else 1


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True, help="path to a JSONL labelled set")
    parser.add_argument(
        "--estimator", default="baseline", choices=sorted(ESTIMATORS), help="which estimator to run"
    )
    args = parser.parse_args(list(argv) if argv is not None else None)

    try:
        samples = load_dataset(args.dataset)
    except (FileNotFoundError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    estimator = ESTIMATORS[args.estimator]()
    return report(estimator.name, evaluate(estimator, samples))


if __name__ == "__main__":
    raise SystemExit(main())
