import pytest

from quantity_ml import should_abstain


def test_abstains_below_threshold():
    assert should_abstain(confidence=0.42, threshold=0.80) is True


def test_reports_at_or_above_threshold():
    assert should_abstain(confidence=0.80, threshold=0.80) is False
    assert should_abstain(confidence=0.95, threshold=0.80) is False


@pytest.mark.parametrize("bad", [-0.1, 1.1])
def test_rejects_out_of_range_confidence(bad: float):
    with pytest.raises(ValueError):
        should_abstain(confidence=bad, threshold=0.5)


@pytest.mark.parametrize("bad", [-0.1, 1.1])
def test_rejects_out_of_range_threshold(bad: float):
    with pytest.raises(ValueError):
        should_abstain(confidence=0.5, threshold=bad)
