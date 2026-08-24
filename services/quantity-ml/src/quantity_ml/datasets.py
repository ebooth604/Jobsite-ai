"""Dataset provenance rules for the accuracy harness.

Technical plan §5.4d draws one hard line: simulated data may train a model and
may never measure one. §11 turns that into an engineering requirement — the leak
assertion must fail the build rather than live as a convention people remember.

This module is that assertion, plus the two things it needs to be meaningful: a
capture record that carries its origin, and the synthetic-share figure §5.4d
requires alongside every model version.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

__all__ = [
    "Capture",
    "SimulatedDataLeak",
    "MEASURABLE_ORIGINS",
    "SIMULATED",
    "assert_no_simulated_leak",
    "measurable",
    "synthetic_share",
]

SIMULATED = "simulated"

#: Origins admissible in a held-out set used to report accuracy (§5.4a, §5.4b).
#: Mirrors ``MEASURABLE_ORIGINS`` in @sitewire/shared-types — the two must agree.
MEASURABLE_ORIGINS = frozenset({"field", "self_measured"})


class SimulatedDataLeak(AssertionError):
    """Raised when simulated captures reach a set used for measurement.

    Deliberately an AssertionError: this is a build-failing condition, not a
    recoverable one. An accuracy figure computed over a leaked set is wrong in a
    way that looks fine, which is exactly why it gets its own exception type.
    """


@dataclass(frozen=True)
class Capture:
    """A photo/video record, reduced to the fields provenance depends on.

    The full entity is technical plan §4. ``origin`` is set at ingest and never
    inferred later — that is what makes the leak test enforceable rather than a
    guess about where a file came from.
    """

    capture_id: str
    origin: str
    project_id: str | None = None
    scope_item_id: str | None = None

    def __post_init__(self) -> None:
        known = MEASURABLE_ORIGINS | {SIMULATED}
        if self.origin not in known:
            raise ValueError(
                f"unknown capture origin {self.origin!r}; expected one of {sorted(known)}"
            )


def assert_no_simulated_leak(captures: Iterable[Capture]) -> None:
    """Fail if any capture in a held-out set is simulated (§5.4d, §11).

    Call this at the top of every accuracy computation. It names the offending
    captures, because "a leak exists somewhere in 4,000 records" is not a
    finding anyone can act on.
    """
    leaked = [c.capture_id for c in captures if c.origin == SIMULATED]
    if leaked:
        shown = ", ".join(leaked[:10])
        more = f" (+{len(leaked) - 10} more)" if len(leaked) > 10 else ""
        raise SimulatedDataLeak(
            f"{len(leaked)} simulated capture(s) reached a measurement set: {shown}{more}. "
            "Simulated data may train a model and may never measure one (technical plan §5.4d)."
        )


def measurable(captures: Iterable[Capture]) -> list[Capture]:
    """Return only captures admissible for measurement.

    This is a filter for *building* a held-out set. It is not a substitute for
    ``assert_no_simulated_leak`` — silently dropping a leak hides the fact that
    simulated data was routed somewhere it should never have reached.
    """
    return [c for c in captures if c.origin in MEASURABLE_ORIGINS]


def synthetic_share(training_mix: Iterable[Capture]) -> float:
    """Fraction of a training mix that is simulated, in [0, 1].

    §5.4d requires this travel with ``model_version`` and appear on any accuracy
    report that leaves the building. Training on synthetic data is allowed; not
    saying how much is not. Returns 0.0 for an empty mix.
    """
    mix = list(training_mix)
    if not mix:
        return 0.0
    return sum(1 for c in mix if c.origin == SIMULATED) / len(mix)
