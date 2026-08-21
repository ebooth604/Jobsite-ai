"""Run the accuracy harness.

    uv run python -m quantity_ml.evaluation --dataset data/electrical_roughin_v1.jsonl

Exits non-zero when the estimator is below the bar, so CI cannot quietly
record a failing spike as a pass.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from pathlib import Path

from .dataset import DatasetError, load_jsonl
from .estimators import BaselineEstimator
from .harness import SimulatedCaptureLeakError, evaluate

ESTIMATORS = {"baseline": BaselineEstimator}


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="quantity_ml.evaluation", description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True, help="path to a JSONL labelled set")
    parser.add_argument("--estimator", default="baseline", choices=sorted(ESTIMATORS))
    args = parser.parse_args(argv)

    try:
        samples = load_jsonl(args.dataset)
    except DatasetError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    try:
        report = evaluate(ESTIMATORS[args.estimator](), samples)
    except SimulatedCaptureLeakError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 3

    print()
    print("\n".join(report.summary_lines()))
    return 0 if report.meets_bar else 1


if __name__ == "__main__":
    raise SystemExit(main())
