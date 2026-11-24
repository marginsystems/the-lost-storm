from __future__ import annotations

import argparse
import math

import pytest

from lost_storm_rl.bridge import hello
from lost_storm_rl.train import LOG_HEADER, check_roams, roam_stats


def said(roams: int, escorts: int) -> dict[str, object]:
    return hello(1, 8, 1, 0.2, 5, 0, [], None, None, None, roams=roams, escorts=escorts)


def test_hello_names_roams_and_escorts_only_when_asked() -> None:
    assert "roams" not in said(0, 0) and "escorts" not in said(0, 0)
    assert said(2, 1)["roams"] == 2
    assert said(2, 1)["escorts"] == 1
    assert said(2, 1)["duels"] == 1


def test_roam_stats_count_leads_and_partners_apart() -> None:
    finished = [
        {"situation": "arena", "outcome": "won", "total": 9.0},
        {"situation": "duel", "outcome": "won", "total": 9.0},
        {"situation": "roam", "role": "lead", "outcome": "won", "total": 4.0},
        {"situation": "roam", "role": "lead", "outcome": "died", "total": -2.0},
        {"situation": "roam", "role": "lead", "outcome": "won", "total": 6.0},
        {"situation": "roam", "role": "partner", "outcome": "timeout", "total": 0.0},
    ]
    stats = roam_stats(finished)
    assert stats.seats == 4
    assert stats.lead_won == pytest.approx(2 / 3)
    assert stats.partner_won == 0
    assert stats.mean_return == pytest.approx(2.0)


def test_roam_stats_with_no_roams_are_empty() -> None:
    stats = roam_stats([{"situation": "arena", "outcome": "won", "total": 1.0}])
    assert stats.seats == 0
    assert math.isnan(stats.lead_won) and math.isnan(stats.partner_won) and math.isnan(stats.mean_return)


def test_roams_and_escorts_that_do_not_fit_in_the_envs_are_refused() -> None:
    parser = argparse.ArgumentParser()
    check_roams(parser, 2, 4, 4, 16)
    for duels, roams, escorts in ((2, 5, 4), (0, -1, 0), (0, 0, -1), (8, 1, 0)):
        with pytest.raises(SystemExit):
            check_roams(parser, duels, roams, escorts, 16)


def test_the_log_has_a_column_for_each_roam_number() -> None:
    start = LOG_HEADER.index("roam_episodes")
    assert LOG_HEADER[start : start + 4] == ["roam_episodes", "roam_won", "partner_won", "roam_return"]
