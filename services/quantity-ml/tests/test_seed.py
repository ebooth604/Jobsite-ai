"""Seed data must be disposable, reproducible, and impossible to measure with."""

import pytest

from quantity_ml import (
    SEED_MARKER,
    SimulatedDataLeak,
    assert_no_simulated_leak,
    generate_seed_captures,
    load_seed_captures,
    measurable,
    purge_seed_data,
    synthetic_share,
)


class TestGeneration:
    def test_generates_the_requested_count(self, tmp_path):
        seed_set = generate_seed_captures(tmp_path / "seed", count=12)
        assert len(seed_set) == 12

    def test_every_capture_is_tagged_simulated(self, tmp_path):
        seed_set = generate_seed_captures(tmp_path / "seed", count=20)
        assert {c.origin for c in seed_set.captures} == {"simulated"}

    def test_writes_a_marker_and_a_manifest(self, tmp_path):
        seed_set = generate_seed_captures(tmp_path / "seed", count=3)
        assert (seed_set.path / SEED_MARKER).exists()
        assert (seed_set.path / "captures.json").exists()

    def test_is_reproducible_for_a_given_seed(self, tmp_path):
        a = generate_seed_captures(tmp_path / "a", count=10, seed=7)
        b = generate_seed_captures(tmp_path / "b", count=10, seed=7)
        assert [c.scope_item_id for c in a.captures] == [c.scope_item_id for c in b.captures]

    def test_rejects_a_nonsense_count(self, tmp_path):
        with pytest.raises(ValueError):
            generate_seed_captures(tmp_path / "seed", count=0)

    def test_rejects_an_unknown_trade(self, tmp_path):
        with pytest.raises(ValueError, match="unknown trade"):
            generate_seed_captures(tmp_path / "seed", count=3, trade="plumbing")

    def test_round_trips_through_disk(self, tmp_path):
        seed_set = generate_seed_captures(tmp_path / "seed", count=6)
        assert load_seed_captures(seed_set.path) == seed_set.captures


class TestSeedDataCannotMeasure:
    """The whole point of tagging seed data is that the harness rejects it."""

    def test_a_seed_set_fails_the_leak_assertion(self, tmp_path):
        seed_set = generate_seed_captures(tmp_path / "seed", count=5)
        with pytest.raises(SimulatedDataLeak):
            assert_no_simulated_leak(seed_set.captures)

    def test_nothing_in_a_seed_set_is_measurable(self, tmp_path):
        seed_set = generate_seed_captures(tmp_path / "seed", count=5)
        assert measurable(seed_set.captures) == []

    def test_a_pure_seed_training_mix_reports_full_synthetic_share(self, tmp_path):
        seed_set = generate_seed_captures(tmp_path / "seed", count=5)
        assert synthetic_share(seed_set.captures) == 1.0


class TestPurge:
    def test_removes_the_directory(self, tmp_path):
        seed_set = generate_seed_captures(tmp_path / "seed", count=4)
        purge_seed_data(seed_set.path)
        assert not seed_set.path.exists()

    def test_reports_how_many_files_it_removed(self, tmp_path):
        seed_set = generate_seed_captures(tmp_path / "seed", count=4)
        # marker + manifest
        assert purge_seed_data(seed_set.path) == 2

    def test_purging_a_missing_path_is_not_an_error(self, tmp_path):
        assert purge_seed_data(tmp_path / "never-existed") == 0

    def test_refuses_a_directory_it_did_not_create(self, tmp_path):
        real = tmp_path / "real-captures"
        real.mkdir()
        (real / "IMG_0001.jpg").write_bytes(b"not seed data")
        with pytest.raises(ValueError, match="refusing to treat it as removable"):
            purge_seed_data(real)
        assert (real / "IMG_0001.jpg").exists()

    def test_generation_refuses_to_overwrite_unmarked_data(self, tmp_path):
        real = tmp_path / "real-captures"
        real.mkdir()
        (real / "IMG_0001.jpg").write_bytes(b"not seed data")
        with pytest.raises(ValueError, match="refusing to treat it as removable"):
            generate_seed_captures(real, count=3)
        assert (real / "IMG_0001.jpg").exists()

    def test_regenerating_over_a_seed_set_is_allowed(self, tmp_path):
        first = generate_seed_captures(tmp_path / "seed", count=3)
        second = generate_seed_captures(tmp_path / "seed", count=8)
        assert len(second) == 8
        assert first.path == second.path
