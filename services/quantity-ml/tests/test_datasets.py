"""The §11 leak test: simulated data may train a model, never measure one.

These tests exist to fail the build. If the leak assertion is ever weakened,
that is a product commitment breaking, not a test getting stale.
"""

import pytest

from quantity_ml import (
    Capture,
    SimulatedDataLeak,
    assert_no_simulated_leak,
    measurable,
    synthetic_share,
)


def field(n: int) -> Capture:
    return Capture(capture_id=f"field-{n:03d}", origin="field")


def self_measured(n: int) -> Capture:
    return Capture(capture_id=f"sm-{n:03d}", origin="self_measured")


def simulated(n: int) -> Capture:
    return Capture(capture_id=f"sim-{n:03d}", origin="simulated")


class TestLeakAssertion:
    def test_clean_held_out_set_passes(self):
        assert_no_simulated_leak([field(1), self_measured(2), field(3)])

    def test_empty_set_passes(self):
        assert_no_simulated_leak([])

    def test_single_simulated_capture_fails_the_build(self):
        held_out = [field(1), simulated(2), self_measured(3)]
        with pytest.raises(SimulatedDataLeak):
            assert_no_simulated_leak(held_out)

    def test_names_the_offending_captures(self):
        with pytest.raises(SimulatedDataLeak) as excinfo:
            assert_no_simulated_leak([field(1), simulated(7)])
        assert "sim-007" in str(excinfo.value)

    def test_reports_a_count_for_large_leaks(self):
        held_out = [simulated(i) for i in range(25)]
        with pytest.raises(SimulatedDataLeak) as excinfo:
            assert_no_simulated_leak(held_out)
        message = str(excinfo.value)
        assert "25 simulated capture(s)" in message
        assert "+15 more" in message


class TestMeasurableFilter:
    def test_drops_simulated_captures(self):
        mixed = [field(1), simulated(2), self_measured(3)]
        assert [c.capture_id for c in measurable(mixed)] == ["field-001", "sm-003"]

    def test_filtered_set_satisfies_the_leak_assertion(self):
        mixed = [field(1), simulated(2), self_measured(3)]
        assert_no_simulated_leak(measurable(mixed))


class TestSyntheticShare:
    def test_reports_zero_for_an_all_real_mix(self):
        assert synthetic_share([field(1), self_measured(2)]) == 0.0

    def test_reports_one_for_an_all_simulated_mix(self):
        assert synthetic_share([simulated(1), simulated(2)]) == 1.0

    def test_reports_the_fraction_for_a_blended_mix(self):
        mix = [field(1), self_measured(2), simulated(3), simulated(4)]
        assert synthetic_share(mix) == 0.5

    def test_empty_mix_is_zero_not_an_error(self):
        assert synthetic_share([]) == 0.0


class TestCaptureValidation:
    def test_rejects_an_unknown_origin(self):
        with pytest.raises(ValueError, match="unknown capture origin"):
            Capture(capture_id="x-1", origin="scraped")

    @pytest.mark.parametrize("origin", ["field", "self_measured", "simulated"])
    def test_accepts_every_documented_origin(self, origin: str):
        assert Capture(capture_id="x-1", origin=origin).origin == origin
