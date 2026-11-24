from __future__ import annotations

import json
import math
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import torch

from .bridge import ArenaEnvs
from .model import load

GATHER_GOALS = ("spot", "meet", "face")
GATHER_COLUMNS = ["gather_episodes", "gather_won", "gather_contact", "gather_intrusions", "gather_crossings", "gather_jitters", "gather_return", *[f"{goal}_won" for goal in GATHER_GOALS]]
EVAL_GATHERS_AT_ONCE = 8


@dataclass(frozen=True)
class GatherStats:
    episodes: int
    won: float
    contact: float
    intrusions: float
    crossings: float
    jitters: float
    mean_return: float
    by_goal: dict[str, float] = field(default_factory=dict)


def gather_episodes(finished: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [episode for episode in finished if episode.get("situation") == "gather"]


def _won(episode: dict[str, Any]) -> bool:
    return episode["outcome"] == "won"


def _touched(episode: dict[str, Any]) -> bool:
    return float(episode.get("contacts", 0)) > 0


def _share(episodes: list[dict[str, Any]], test: Callable[[dict[str, Any]], bool]) -> float:
    return sum(1 for episode in episodes if test(episode)) / len(episodes) if episodes else float("nan")


def _mean(episodes: list[dict[str, Any]], key: str) -> float:
    return float(np.mean([float(episode.get(key, 0)) for episode in episodes])) if episodes else float("nan")


def gather_stats(finished: list[dict[str, Any]]) -> GatherStats:
    episodes = gather_episodes(finished)
    by_goal ={goal: _share([episode for episode in episodes if episode.get("goal") == goal], _won) for goal in GATHER_GOALS}
    return GatherStats(len(episodes), _share(episodes, _won), _share(episodes, _touched), _mean(episodes, "intrusions"), _mean(episodes, "crossings"), _mean(episodes, "jitters"), _mean(episodes, "total"), by_goal)


def gather_row(stats: GatherStats) -> list[float | int]:
    return [stats.episodes, round(stats.won, 3), round(stats.contact, 3), round(stats.intrusions, 3), round(stats.crossings, 3), round(stats.jitters, 3), round(stats.mean_return, 3), *[round(stats.by_goal.get(goal, float("nan")), 3) for goal in GATHER_GOALS]]


def gather_note(stats: GatherStats) -> str:
    if stats.episodes == 0:
        return ""
    goals = " ".join(f"{goal} {'-' if math.isnan(stats.by_goal.get(goal, float('nan'))) else f'{stats.by_goal[goal]:.0%}'}" for goal in GATHER_GOALS)
    return f" | gathers {stats.episodes} won {stats.won:.0%} ({goals}) contact {stats.contact:.0%} space {stats.intrusions:.2f} return {stats.mean_return:.2f}"


def tally_goals(episodes: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    tallies: dict[str, dict[str, int]] = {}
    for episode in episodes:
        goal = tallies.setdefault(str(episode.get("goal")), {})
        goal[episode["outcome"]] = goal.get(episode["outcome"], 0) + 1
    return tallies


def evaluate_gathers(path: str, episodes: int, seed: int, greedy: bool, span: tuple[int, int] | None = None) -> None:
    at_once = min(episodes, EVAL_GATHERS_AT_ONCE)
    envs = ArenaEnvs(1, at_once, seed, 0.0, 1, span=span, gathers=at_once)
    try:
        policy = load(path, envs.contract, torch.device("cpu"))
        policy.eval()
        envs.tag("eval-gather")
        batch = envs.reset()
        played: list[dict[str, Any]] = []
        while len(played) < episodes:
            with torch.no_grad():
                action, _, _ = policy.act(torch.from_numpy(batch.obs), torch.from_numpy(batch.mask), greedy=greedy)
            batch = envs.step(action.numpy())
            played.extend(gather_episodes(batch.finished))
    finally:
        envs.close()
    played = played[:episodes]
    stats = gather_stats(played)
    print(json.dumps({"gathers": stats.episodes, "greedy": greedy, "won": stats.won, "won_by_goal": stats.by_goal, "outcomes_by_goal": tally_goals(played), "contact": stats.contact, "intrusions": stats.intrusions, "crossings": stats.crossings, "jitters": stats.jitters, "mean_return": stats.mean_return, "mean_decisions": float(np.mean([episode["decisions"] for episode in played]))}, indent=2))
