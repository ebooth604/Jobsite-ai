"""Loading labelled sets.

A labelled set is JSONL, one scope-day per line. There is deliberately no
synthetic-data generator here: fabricating samples would only measure our own
assumptions, and the plan is explicit that the real artifact — three firms'
photo sets with matching as-built quantities and bid takeoffs — is what the
first quarter has to produce.
"""

from __future__ import annotations

import json
from pathlib import Path

from .estimators import Sample, ScopeContext


class DatasetError(Exception):
    """A labelled set is missing or malformed."""


def load_jsonl(path: Path) -> list[Sample]:
    if not path.exists():
        raise DatasetError(
            f"no dataset at {path}. The harness needs real jobsite photographs with "
            "matching as-built quantities and bid takeoffs. Nothing here works "
            "without them, and synthesizing them would only measure our own "
            "assumptions."
        )

    samples: list[Sample] = []
    for line_number, raw_line in enumerate(path.read_text().splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            row = json.loads(line)
            scope = row["scope"]
            samples.append(
                Sample(
                    sample_id=str(row["sample_id"]),
                    scope=ScopeContext(
                        scope_item_id=str(scope["scope_item_id"]),
                        trade=str(scope["trade"]),
                        description=str(scope["description"]),
                        unit_of_measure=str(scope["unit_of_measure"]),
                        bid_quantity=float(scope["bid_quantity"]),
                        bid_hours=float(scope["bid_hours"]),
                    ),
                    work_date=str(row["work_date"]),
                    actual_quantity=float(row["actual_quantity"]),
                    image_paths=tuple(row.get("image_paths", ())),
                    origin=row.get("origin", "field"),
                )
            )
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise DatasetError(f"{path}:{line_number}: malformed sample - {exc}") from exc

    if not samples:
        raise DatasetError(f"{path} contains no samples")
    return samples
