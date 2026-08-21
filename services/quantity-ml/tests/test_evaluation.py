import pytest

from quantity_ml.evaluation import (
    BaselineEstimator,
    Estimate,
    EvaluationReport,
    Sample,
    ScopeContext,
    SimulatedCaptureLeakError,
    evaluate,
)

SCOPE = ScopeContext(
    scope_item_id="sc-1",
    trade="electrical",
    description="L2 branch conduit, east",
    unit_of_measure="LF",
    bid_quantity=12_000,
    bid_hours=780,
)


def sample(sample_id: str = "s1", *, actual: float = 190.0, origin: str = "field") -> Sample:
    return Sample(
        sample_id=sample_id,
        scope=SCOPE,
        work_date="2026-08-21",
        actual_quantity=actual,
        origin=origin,  # type: ignore[arg-type]
    )


class PerfectEstimator:
    """Answers the ground truth exactly. Used to prove the scoring itself works."""

    name = "perfect"

    def __init__(self, truth: dict[str, float]) -> None:
        self._truth = truth

    def estimate(self, sample: Sample) -> Estimate:
        return Estimate(quantity=self._truth[sample.sample_id], confidence=0.99)


class AlwaysAbstains:
    name = "always-abstains"

    def estimate(self, sample: Sample) -> Estimate:
        return Estimate(quantity=None, confidence=0.0, abstained=True)


class Exploding:
    name = "exploding"

    def estimate(self, sample: Sample) -> Estimate:
        raise RuntimeError("model server unreachable")


def test_simulated_captures_never_reach_a_measurement_set():
    samples = [sample("s1"), sample("s2", origin="simulated")]
    with pytest.raises(SimulatedCaptureLeakError) as excinfo:
        evaluate(BaselineEstimator(), samples)
    assert "s2" in str(excinfo.value)


def test_self_measured_captures_are_admissible():
    report = evaluate(BaselineEstimator(), [sample("s1", origin="self_measured")])
    assert report.sample_count == 1


def test_a_perfect_estimator_scores_zero_error_and_meets_the_bar():
    samples = [sample("s1", actual=190), sample("s2", actual=150)]
    truth = {s.sample_id: s.actual_quantity for s in samples}
    report = evaluate(PerfectEstimator(truth), samples)

    assert report.median_absolute_percentage_error == pytest.approx(0.0)
    assert report.coverage == 1.0
    assert report.meets_bar


def test_the_baseline_is_reported_as_below_the_bar():
    # It ignores the photographs, so it should not clear a 15% median error.
    samples = [sample("s1", actual=190), sample("s2", actual=150)]
    report = evaluate(BaselineEstimator(), samples)

    assert not report.meets_bar
    mdape = report.median_absolute_percentage_error
    assert mdape is not None and mdape > 15.0


def test_high_accuracy_with_low_coverage_still_fails():
    """The failure mode that looks most like success: answer only easy frames."""
    answered = [sample(f"s{i}", actual=100) for i in range(2)]
    skipped = [sample(f"x{i}", actual=100) for i in range(8)]
    truth = {s.sample_id: s.actual_quantity for s in answered}

    class OnlyEasy:
        name = "only-easy"

        def estimate(self, s: Sample) -> Estimate:
            if s.sample_id in truth:
                return Estimate(quantity=truth[s.sample_id], confidence=0.99)
            return Estimate(quantity=None, confidence=0.1, abstained=True)

    report = evaluate(OnlyEasy(), [*answered, *skipped])

    assert report.median_absolute_percentage_error == pytest.approx(0.0)
    assert report.coverage == pytest.approx(0.2)
    assert not report.meets_bar, "perfect accuracy on 20% coverage must not pass"


def test_abstentions_are_never_scored_as_zero_installed():
    report = evaluate(AlwaysAbstains(), [sample("s1", actual=190)])
    assert report.errors == ()
    assert report.abstained_count == 1
    assert report.median_absolute_percentage_error is None
    assert not report.meets_bar


def test_a_crashing_estimator_is_recorded_as_an_abstention_not_a_pass():
    report = evaluate(Exploding(), [sample("s1")])
    assert report.abstained_count == 1
    assert not report.meets_bar


def test_zero_as_builts_are_excluded_from_error_but_counted_in_coverage():
    samples = [sample("s1", actual=0), sample("s2", actual=100)]
    truth = {"s1": 0.0, "s2": 100.0}
    report = evaluate(PerfectEstimator(truth), samples)

    assert report.zero_actual_count == 1
    assert len(report.errors) == 1
    assert report.coverage == 1.0


def test_an_empty_set_does_not_report_success():
    report = EvaluationReport("none", 0, 0, 0, 0, ())
    assert not report.meets_bar
    assert "no scoreable estimates" in "\n".join(report.summary_lines())


def test_a_missing_dataset_says_what_is_actually_needed(tmp_path):
    from quantity_ml.evaluation import DatasetError, load_jsonl

    with pytest.raises(DatasetError) as excinfo:
        load_jsonl(tmp_path / "nope.jsonl")
    assert "as-built" in str(excinfo.value)


def test_a_malformed_line_names_the_line(tmp_path):
    from quantity_ml.evaluation import DatasetError, load_jsonl

    path = tmp_path / "bad.jsonl"
    path.write_text('{"sample_id": "s1"}\n')
    with pytest.raises(DatasetError) as excinfo:
        load_jsonl(path)
    assert ":1:" in str(excinfo.value)


def test_a_well_formed_dataset_round_trips(tmp_path):
    import json

    from quantity_ml.evaluation import load_jsonl

    path = tmp_path / "ok.jsonl"
    path.write_text(
        "# a comment line is skipped\n"
        + json.dumps(
            {
                "sample_id": "s1",
                "work_date": "2026-08-21",
                "actual_quantity": 190,
                "origin": "field",
                "scope": {
                    "scope_item_id": "sc-1",
                    "trade": "electrical",
                    "description": "L2 branch conduit",
                    "unit_of_measure": "LF",
                    "bid_quantity": 12000,
                    "bid_hours": 780,
                },
            }
        )
        + "\n"
    )
    samples = load_jsonl(path)
    assert len(samples) == 1
    assert samples[0].scope.budgeted_units_per_hour == pytest.approx(12000 / 780)
