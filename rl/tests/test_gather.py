from __future__ import annotations

import argparse
import math

import pytest

from lost_storm_rl.bridge import hello
from lost_storm_rl.gather import GATHER_COLUMNS, gather_note, gather_row, gather_stats
from lost_storm_rl.train import LOG_HEADER, check_roams


def test_hello_names_gathers_only_when_asked() -> None:
    assert "gathers" not in hello(1, 8, 0, 0.2, 5, 0, [], None, None, None)
    assert hello(1, 8, 0, 0.2, 5, 0, [], None, None, None, gathers=6)["gathers"] == 6


def test_gather_stats_count_success_contact_and_space() -> None:
    finished = [
        {"situation": "arena", "outcome": "won", "total": 9.0},
        {"situation": "gather", "goal": "spot", "outcome": "won", "total": 3.0, "contacts": 0, "intrusions": 1, "crossings": 0, "jitters": 2},
        {"situation": "gather", "goal": "spot", "outcome": "timeout", "total": -1.0, "contacts": 2, "intrusions": 3, "crossings": 1, "jitters": 0},
        {"situation": "gather", "goal": "meet", "outcome": "won", "total": 4.0, "contacts": 0, "intrusions": 2, "crossings": 0, "jitters": 1},
    ]
    stats = gather_stats(finished)
    assert stats.episodes == 3
    assert stats.won == pytest.approx(2 / 3)
    assert stats.contact == pytest.approx(1 / 3)
    assert stats.intrusions == pytest.approx(2.0)
    assert stats.crossings == pytest.approx(1 / 3)
    assert stats.by_goal["spot"] == pytest.approx(0.5)
    assert stats.by_goal["meet"] == 1
    assert math.isnan(stats.by_goal["face"])
    assert len(gather_row(stats)) == len(GATHER_COLUMNS)
    assert "gathers 3 won 67%" in gather_note(stats)


def test_no_gathers_leave_an_empty_note() -> None:
    stats = gather_stats([{"situation": "arena", "outcome": "won", "total": 1.0}])
    assert stats.episodes == 0 and math.isnan(stats.won)
    assert gather_note(stats) == ""


def test_the_log_ends_with_the_gather_columns() -> None:
    assert LOG_HEADER[-len(GATHER_COLUMNS) :] == GATHER_COLUMNS
    assert "gather_contact" in LOG_HEADER and "gather_intrusions" in LOG_HEADER


def test_gathers_that_do_not_fit_in_the_envs_are_refused() -> None:
    parser = argparse.ArgumentParser()
    check_roams(parser, 1, 2, 0, 16, 12)
    for gathers in (13, -1):
        with pytest.raises(SystemExit):
            check_roams(parser, 1, 2, 0, 16, gathers)
