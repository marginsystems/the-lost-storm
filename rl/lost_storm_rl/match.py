from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import torch

from .bridge import ArenaEnvs
from .builds import seat_builds
from .model import Policy

MATCH_DUELS_AT_ONCE = 8


def first_sits(envs: int, first_seat: int) -> np.ndarray:
    return np.array([env % 2 == first_seat for env in range(envs)], dtype=bool)


@dataclass(frozen=True)
class DuelResult:
    seed: int
    first_seat: int
    first: str
    second: str


def results(seats: list[dict[str, Any]], first_seat: int) -> list[DuelResult]:
    by_env = {int(seat["env"]): seat for seat in seats}
    duels: list[DuelResult] = []
    for env in sorted(by_env):
        if env % 2 != 0:
            continue
        rival = by_env.get(env + 1)
        if rival is None:
            raise ValueError(f"duel at env {env} finished without its second seat")
        first, second = (by_env[env], rival) if first_seat == 0 else (rival, by_env[env])
        duels.append(DuelResult(int(by_env[env]["seed"]), first_seat, str(first["outcome"]), str(second["outcome"])))
    return duels


def complete(played: list[DuelResult], seed: int, duels: int) -> bool:
    return {duel.seed for duel in played} >= set(range(seed, seed + duels))


def score(duels: list[DuelResult]) -> dict[str, Any]:
    first_won = sum(1 for duel in duels if duel.first == "won")
    second_won = sum(1 for duel in duels if duel.second == "won")
    by_seat = {f"first in seat {seat}": {"duels": sum(1 for duel in duels if duel.first_seat == seat), "first_won": sum(1 for duel in duels if duel.first_seat == seat and duel.first == "won"), "second_won": sum(1 for duel in duels if duel.first_seat == seat and duel.second == "won")} for seat in (0, 1)}
    return {"duels": len(duels), "first_won": first_won, "second_won": second_won, "undecided": len(duels) - first_won - second_won, "first_share": first_won / max(1, first_won + second_won), "by_seat": by_seat}


def play_side(first: Policy, second: Policy, first_seat: int, duels: int, seed: int, jitter: float, greedy: bool, replays: Path | None, first_build: dict[str, Any] | None = None, second_build: dict[str, Any] | None = None) -> list[DuelResult]:
    at_once = min(duels, MATCH_DUELS_AT_ONCE)
    envs = ArenaEnvs(1, at_once * 2, seed, jitter, 1, keep_every=1 if replays is not None else 0, replays=replays, duels=at_once, seats=seat_builds(first_build, second_build, first_seat))
    sits = first_sits(at_once * 2, first_seat)
    played: list[DuelResult] = []
    try:
        envs.tag(f"match-first{first_seat}")
        batch = envs.reset()
        while not complete(played, seed, duels):
            obs = torch.from_numpy(batch.obs)
            mask = torch.from_numpy(batch.mask)
            with torch.no_grad():
                ours, _, _ = first.act(obs[sits], mask[sits], greedy=greedy)
                theirs, _, _ = second.act(obs[~sits], mask[~sits], greedy=greedy)
            action = np.zeros((at_once * 2, ours.shape[1]), dtype=np.int32)
            action[sits] = ours.numpy()
            action[~sits] = theirs.numpy()
            batch = envs.step(action)
            played.extend(results([episode for episode in batch.finished if episode["situation"] == "duel"], first_seat))
    finally:
        envs.close()
    return sorted((duel for duel in played if seed <= duel.seed < seed + duels), key=lambda duel: duel.seed)


def play_match(first: Policy, second: Policy, duels: int, seed: int, jitter: float, greedy: bool, replays: Path | None, first_build: dict[str, Any] | None = None, second_build: dict[str, Any] | None = None) -> list[DuelResult]:
    return [duel for first_seat in (0, 1) for duel in play_side(first, second, first_seat, duels, seed, jitter, greedy, replays, first_build, second_build)]
