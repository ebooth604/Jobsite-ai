"""Quantity estimation service.

The models themselves land here after the technical spike reports its accuracy
honestly (see the repo README). This module currently holds only the abstention
rule, which is a policy decision rather than a modelling one.
"""

__all__ = ["should_abstain"]


def should_abstain(confidence: float, threshold: float) -> bool:
    """Return True when an estimate must route to a foreman instead of being reported.

    Abstention is not a failure mode, it is the product behaving correctly: below
    the threshold the answer becomes a 30-second foreman prompt rather than a
    silent guess (technical plan §5.3).

    The threshold is passed in, never hard-coded. It is tunable config per model
    version, because the right value is only knowable after the Q1 spike measures
    real per-item error (technical plan §13.5).
    """
    if not 0.0 <= confidence <= 1.0:
        raise ValueError(f"confidence must be in [0, 1], got {confidence}")
    if not 0.0 <= threshold <= 1.0:
        raise ValueError(f"threshold must be in [0, 1], got {threshold}")
    return confidence < threshold
