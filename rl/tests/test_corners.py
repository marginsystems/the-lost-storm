import argparse

import pytest

from lost_storm_rl.bridge import hello
from lost_storm_rl.train import LOG_HEADER, check_corners, cornered_seats, timeout_share, won_share


def test_hello_names_the_corner_share_only_when_asked() -> None:
    assert "corners" not in hello(1, 8, 1, 0.2, 5, 0, [], None, None, None)
    assert hello(1, 8, 1, 0.2, 5, 0, [], None, None, None, corners=0.4)["corners"] == 0.4


def test_cornered_seats_are_the_duel_seats_that_started_in_a_corner() -> None:
    finished = [
        {"situation": "duel", "corner": "cornered", "outcome": "won", "total": 1.0},
        {"situation": "duel", "corner": "caster", "outcome": "died", "total": -1.0},
        {"situation": "duel", "outcome": "timeout", "total": 0.0},
        {"situation": "duel", "corner": "cornered", "outcome": "timeout", "total": 0.0},
        {"situation": "arena", "outcome": "won", "total": 3.0},
    ]
    cornered = cornered_seats(finished)
    assert len(cornered) == 2
    assert won_share(cornered) == 0.5
    assert timeout_share(cornered) == 0.5


def test_the_log_names_the_corner_columns() -> None:
    start = LOG_HEADER.index("corner_episodes")
    assert LOG_HEADER[start : start + 3] == ["corner_episodes", "corner_won", "corner_timeout"]


def test_a_corner_share_needs_duels_to_start_in_a_corner_and_stays_within_one() -> None:
    parser = argparse.ArgumentParser()
    check_corners(parser, 0.0, 0)
    check_corners(parser, 0.4, 3)
    for share, duels in ((0.4, 0), (1.5, 3), (-0.1, 3)):
        with pytest.raises(SystemExit):
            check_corners(parser, share, duels)
