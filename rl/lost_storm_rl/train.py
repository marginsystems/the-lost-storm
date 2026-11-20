from __future__ import annotations

import argparse
import csv
import json
import math
import os
import time
from dataclasses import asdict, dataclass
from fractions import Fraction
from pathlib import Path
from typing import Any, TextIO

import numpy as np
import torch

from .anchor import HEAD_NAMES, BotBuffer, LevelCurriculum, bot_weight, imitation_loss, paired
from .best import BestKeeper, best_check, note_best, saved_rate
from .bridge import MAX_SEED, WORKER_SEED_STRIDE, ArenaEnvs, BridgeError, demonstrations
from .builds import build_name, example_builds, load_optional, seat_builds
from .match import MATCH_DUELS_AT_ONCE, play_match, score
from .model import Policy, load, save, widen

BOT_SEED_OFFSET = 1_000_000_000
BOT_SEED_STRIDE = 10_007
SEED_SPACE = 2**32
HELD_OUT_SEED = 3_000_000_000
BEST_SEED = HELD_OUT_SEED + 1_000_000
MATCH_SEED = HELD_OUT_SEED + 2_000_000

RUNS = Path(__file__).resolve().parents[1] / "runs"


def pick_device(name: str) -> torch.device:
    if name == "auto":
        return torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    return torch.device(name)


def default_workers() -> int:
    return max(1, min(12, (os.cpu_count() or 4) - 4))


LOG_HEADER = ["update", "decisions", "seconds", "episodes", "win_rate", "died_rate", "mean_return", "mean_waves", "policy_loss", "value_loss", "entropy", "explained", "kl", "duel_episodes", "duel_decided", "duel_return", "bot_loss", "bot_weight", "win_high"]


def retired_log(path: Path) -> Path:
    index = 1
    while (path.parent / f"{path.stem}-{index}{path.suffix}").exists():
        index += 1
    return path.parent / f"{path.stem}-{index}{path.suffix}"


def open_log(path: Path) -> TextIO:
    if path.exists():
        with path.open(newline="") as existing:
            header = next(csv.reader(existing), None)
        if header != LOG_HEADER:
            path.rename(retired_log(path))
    fresh = not path.exists()
    log_file = path.open("a", newline="")
    if fresh:
        csv.writer(log_file).writerow(LOG_HEADER)
        log_file.flush()
    return log_file


@dataclass
class ImitateArgs:
    run: str
    episodes: int
    workers: int
    seed: int
    jitter: float
    waves: int
    epochs: int
    batch: int
    lr: float
    width: int
    device: str


def imitate(args: ImitateArgs) -> Path:
    folder = RUNS / args.run
    folder.mkdir(parents=True, exist_ok=True)
    started = time.time()
    data = demonstrations(args.workers, args.episodes, args.seed, args.jitter, args.waves)
    outcomes: dict[str, int] = {}
    for episode in data.episodes:
        outcomes[episode["outcome"]] = outcomes.get(episode["outcome"], 0) + 1
    print(f"bot played {len(data.episodes)} episodes {outcomes} -> {len(data.actions)} decisions in {time.time() - started:.0f}s", flush=True)
    probe = ArenaEnvs(1, 1, args.seed, args.jitter, args.waves)
    contract = probe.contract
    probe.close()
    device = pick_device(args.device)
    policy = Policy(contract, width=args.width).to(device)
    optimizer = torch.optim.Adam(policy.parameters(), lr=args.lr)
    obs = torch.from_numpy(data.obs)
    mask = torch.from_numpy(data.mask)
    actions = torch.from_numpy(data.actions).long()
    count = len(actions)
    order = np.arange(count)
    rng = np.random.default_rng(args.seed)
    held = rng.random(count) < 0.05
    for epoch in range(args.epochs):
        rng.shuffle(order)
        totals = np.zeros(4)
        correct = np.zeros(4)
        seen = np.zeros(4)
        for start in range(0, count, args.batch):
            index = order[start : start + args.batch]
            index = index[~held[index]]
            if len(index) == 0:
                continue
            batch_obs = obs[index].to(device)
            batch_mask = mask[index].to(device)
            batch_actions = actions[index].to(device)
            learned = imitation_loss(policy, batch_obs, batch_mask, batch_actions)
            totals += learned.totals
            correct += learned.correct
            seen += learned.seen
            optimizer.zero_grad()
            learned.loss.backward()
            torch.nn.utils.clip_grad_norm_(policy.parameters(), 1.0)
            optimizer.step()
        accuracy = " ".join(f"{name}={correct[i] / max(1, seen[i]):.3f}" for i, name in enumerate(HEAD_NAMES))
        print(f"epoch {epoch + 1}/{args.epochs} loss={totals.sum() / max(1, seen[0]):.3f} {accuracy}", flush=True)
    path = folder / "imitate.pt"
    save(policy, str(path), {"stage": "imitate", "args": asdict(args)})
    print(f"saved {path}", flush=True)
    return path


@dataclass
class PpoArgs:
    run: str
    start: str | None
    workers: int
    envs: int
    seed: int
    jitter: float
    waves: int
    updates: int
    steps: int
    epochs: int
    minibatches: int
    lr: float
    gamma: float
    lam: float
    clip: float
    entropy: float
    value_coef: float
    value_warmup: int
    save_every: int
    keep_every: int
    width: int
    device: str
    duels: int = 0
    bot_coef: float = 0.5
    bot_floor: float = 0.05
    bot_decay: int = 3000
    bot_every: int = 20
    bot_episodes: int = 16
    bot_keep: int = 4
    curriculum: float = 0.5
    best_every: int = 200
    best_episodes: int = 64
    best_seed: int = BEST_SEED
    build: str | None = None


def refresh_bot(envs: ArenaEnvs, buffer: BotBuffer, args: PpoArgs, update: int, weights: list[float]) -> None:
    started = time.time()
    part = envs.bot(args.seed + BOT_SEED_OFFSET + update * BOT_SEED_STRIDE, args.bot_episodes, args.jitter, args.waves, weights or None)
    buffer.add(part)
    won = sum(1 for episode in part.episodes if episode["outcome"] == "won")
    print(f"bot played {len(part.episodes)} arenas, won {won}, {len(part.actions)} decisions in {time.time() - started:.0f}s; buffer {len(buffer)}", flush=True)


def explained(values: np.ndarray, returns: np.ndarray) -> float:
    spread = np.var(returns)
    return float("nan") if spread == 0 else float(1 - np.var(returns - values) / spread)


def ppo(args: PpoArgs) -> Path:
    folder = RUNS / args.run
    replays = folder / "replays"
    folder.mkdir(parents=True, exist_ok=True)
    learner = load_optional(args.build)
    envs = ArenaEnvs(args.workers, args.envs, args.seed, args.jitter, args.waves, args.keep_every, replays, args.duels, build=learner, rivals=example_builds() if learner is not None else None)
    contract = envs.contract
    if learner is not None:
        print(f"build {contract.get('build')} at level {contract.get('duelLevel')} in every arena and the first duel seat; duel rivals {', '.join(contract.get('rivals') or []) or 'random bench heroes'}", flush=True)
    levels = contract["levels"]
    curriculum = LevelCurriculum(int(levels["min"]), int(levels["max"]), args.curriculum)
    if args.curriculum > 0 and learner is None:
        envs.set_levels(curriculum.weights())
    buffer = BotBuffer(args.bot_keep)
    keeper = BestKeeper(args.best_every, best_so_far(folder / "best.pt"))
    sampler = np.random.default_rng(args.seed)
    if args.bot_coef > 0:
        refresh_bot(envs, buffer, args, 0, curriculum.weights())
    device = pick_device(args.device)
    policy = load(args.start, contract, device) if args.start else Policy(contract, width=args.width).to(device)
    actor = Policy(contract, width=policy.width)
    actor.load_state_dict(policy.state_dict())
    actor.eval()
    optimizer = torch.optim.Adam(policy.parameters(), lr=args.lr, eps=1e-5)
    count = envs.count
    size = contract["layout"]["size"]
    mask_size = contract["layout"]["mask"]
    obs_buf = np.zeros((args.steps, count, size), dtype=np.float32)
    mask_buf = np.zeros((args.steps, count, mask_size), dtype=np.uint8)
    act_buf = np.zeros((args.steps, count, 4), dtype=np.int64)
    logp_buf = np.zeros((args.steps, count), dtype=np.float32)
    val_buf = np.zeros((args.steps, count), dtype=np.float32)
    rew_buf = np.zeros((args.steps, count), dtype=np.float32)
    done_buf = np.zeros((args.steps, count), dtype=np.float32)
    log_file = open_log(folder / "log.csv")
    log = csv.writer(log_file)
    batch = envs.reset()
    next_obs, next_mask = batch.obs, batch.mask
    next_done = np.zeros(count, dtype=np.float32)
    decisions = 0
    started = time.time()
    try:
        for update in range(1, args.updates + 1):
            envs.tag(f"u{update:05d}")
            finished: list[dict[str, Any]] = []
            for step in range(args.steps):
                obs_buf[step] = next_obs
                mask_buf[step] = next_mask
                done_buf[step] = next_done
                with torch.no_grad():
                    action, logp, value = actor.act(torch.from_numpy(next_obs), torch.from_numpy(next_mask))
                act_buf[step] = action.numpy()
                logp_buf[step] = logp.numpy()
                val_buf[step] = value.numpy()
                batch = envs.step(action.numpy())
                rew_buf[step] = batch.rewards
                next_obs, next_mask = batch.obs, batch.mask
                next_done = batch.dones.astype(np.float32)
                finished.extend(batch.finished)
            decisions += args.steps * count
            with torch.no_grad():
                _, last_value = actor.logits(torch.from_numpy(next_obs), torch.from_numpy(next_mask))
            last = last_value.numpy()
            advantages = np.zeros_like(rew_buf)
            running = np.zeros(count, dtype=np.float32)
            for step in reversed(range(args.steps)):
                following = last if step == args.steps - 1 else val_buf[step + 1]
                alive = 1.0 - (next_done if step == args.steps - 1 else done_buf[step + 1])
                delta = rew_buf[step] + args.gamma * following * alive - val_buf[step]
                running = delta + args.gamma * args.lam * alive * running
                advantages[step] = running
            returns = advantages + val_buf
            flat = args.steps * count
            b_obs = torch.from_numpy(obs_buf.reshape(flat, size))
            b_mask = torch.from_numpy(mask_buf.reshape(flat, mask_size))
            b_act = torch.from_numpy(act_buf.reshape(flat, 4))
            b_logp = torch.from_numpy(logp_buf.reshape(flat))
            b_adv = torch.from_numpy(advantages.reshape(flat))
            b_ret = torch.from_numpy(returns.reshape(flat))
            warming = update <= args.value_warmup
            minibatch = flat // args.minibatches
            stats = {"policy": 0.0, "value": 0.0, "entropy": 0.0, "kl": 0.0, "bot": 0.0, "n": 0}
            weight = bot_weight(args.bot_coef, args.bot_floor, args.bot_decay, update)
            anchored = weight > 0 and not warming and len(buffer) > 0
            for _ in range(args.epochs):
                order = torch.randperm(flat)
                for start in range(0, flat, minibatch):
                    index = order[start : start + minibatch]
                    obs_mb = b_obs[index].to(device)
                    mask_mb = b_mask[index].to(device)
                    act_mb = b_act[index].to(device)
                    old_mb = b_logp[index].to(device)
                    adv_mb = b_adv[index].to(device)
                    ret_mb = b_ret[index].to(device)
                    adv_mb = (adv_mb - adv_mb.mean()) / (adv_mb.std() + 1e-8)
                    logp, entropy, value = policy.evaluate(obs_mb, mask_mb, act_mb)
                    ratio = torch.exp(logp - old_mb)
                    policy_loss = torch.max(-adv_mb * ratio, -adv_mb * ratio.clamp(1 - args.clip, 1 + args.clip)).mean()
                    value_loss = 0.5 * ((value - ret_mb) ** 2).mean()
                    entropy_mean = entropy.mean()
                    loss = value_loss * args.value_coef if warming else policy_loss + value_loss * args.value_coef - entropy_mean * args.entropy
                    if anchored:
                        bot_obs, bot_mask, bot_act = buffer.sample(sampler, len(index))
                        taught = imitation_loss(policy, bot_obs.to(device), bot_mask.to(device), bot_act.to(device))
                        loss = loss + weight * taught.loss
                        stats["bot"] += taught.loss.item()
                    optimizer.zero_grad()
                    loss.backward()
                    torch.nn.utils.clip_grad_norm_(policy.parameters(), 0.5)
                    optimizer.step()
                    with torch.no_grad():
                        stats["kl"] += float(((ratio - 1) - torch.log(ratio)).mean())
                    stats["policy"] += policy_loss.item()
                    stats["value"] += value_loss.item()
                    stats["entropy"] += entropy_mean.item()
                    stats["n"] += 1
            actor.load_state_dict({key: tensor.detach().cpu() for key, tensor in policy.state_dict().items()})
            n = max(1, stats["n"])
            arena = [episode for episode in finished if episode.get("situation", "arena") == "arena"]
            duels = [episode for episode in finished if episode.get("situation") == "duel"]
            curriculum.note(arena)
            if args.curriculum > 0:
                if learner is None:
                    envs.set_levels(curriculum.weights())
            if args.bot_coef > 0 and update % args.bot_every == 0:
                refresh_bot(envs, buffer, args, update, curriculum.weights())
            win_high = curriculum.win_between(9, int(levels["max"]))
            bot_loss = stats["bot"] / n if anchored else float("nan")
            episodes = len(arena)
            win = sum(1 for episode in arena if episode["outcome"] == "won") / max(1, episodes)
            died = sum(1 for episode in arena if episode["outcome"] == "died") / max(1, episodes)
            mean_return = float(np.mean([episode["total"] for episode in arena])) if arena else float("nan")
            mean_waves = float(np.mean([episode["waves"] for episode in arena])) if arena else float("nan")
            decided = sum(1 for episode in duels if episode["outcome"] != "timeout") / max(1, len(duels))
            duel_return = float(np.mean([episode["total"] for episode in duels])) if duels else float("nan")
            seconds = time.time() - started
            ev = explained(val_buf.reshape(-1), returns.reshape(-1))
            row = [update, decisions, round(seconds, 1), episodes, round(win, 3), round(died, 3), round(mean_return, 3), round(mean_waves, 3), round(stats["policy"] / n, 4), round(stats["value"] / n, 4), round(stats["entropy"] / n, 4), round(ev, 3), round(stats["kl"] / n, 5), len(duels), round(decided, 3), round(duel_return, 3), round(bot_loss, 4), round(weight if anchored else 0.0, 4), round(win_high, 3)]
            log.writerow(row)
            log_file.flush()
            print(f"update {update} | {decisions / max(1.0, seconds):.0f} dec/s | episodes {episodes} won {win:.0%} died {died:.0%} return {mean_return:.2f} waves {mean_waves:.2f}{f' | duels {len(duels)} decided {decided:.0%} return {duel_return:.2f}' if duels else ''}{f' | bot {bot_loss:.2f} x{weight:.2f}' if anchored else ''} | L9+ {win_high:.0%} | entropy {stats['entropy'] / n:.2f} ev {ev:.2f}{' (value warmup)' if warming else ''}", flush=True)
            if update % args.save_every == 0 or update == args.updates:
                save(policy, str(folder / f"policy-u{update:05d}.pt"), {"stage": "ppo", "update": update, "args": asdict(args)})
                save(policy, str(folder / "latest.pt"), {"stage": "ppo", "update": update, "args": asdict(args)})
            if keeper.due(update):
                keep_best(actor, policy, keeper, args, folder, update)
    finally:
        log_file.close()
        envs.close()
    return folder / "latest.pt"


def keep_best(actor: Policy, policy: Policy, keeper: BestKeeper, args: PpoArgs, folder: Path, update: int) -> None:
    started = time.time()
    finished, bot = play_against_bot(actor, args.best_episodes, args.best_seed, args.jitter, args.waves, True, None, load_optional(args.build))
    check = best_check(update, sum(1 for episode in finished if episode["outcome"] == "won"), paired(finished, bot))
    kept = keeper.offer(check)
    if kept:
        part = folder / "best.pt.part"
        save(policy, str(part), {"stage": "ppo", "update": update, "best": asdict(check), "args": asdict(args)})
        os.replace(part, folder / "best.pt")
    note_best(folder / "best.csv", check, kept)
    print(f"best check u{update}: model {check.model_won:.0%} bot {check.bot_won:.0%}, levels 9-12 {check.model_high:.0%} against {check.bot_high:.0%} in {time.time() - started:.0f}s{'; kept as best.pt' if kept else f'; best stays at {float(keeper.best):.0%}'}", flush=True)


def best_so_far(path: Path) -> Fraction:
    if not path.exists():
        return Fraction(-1)
    saved = torch.load(path, map_location="cpu", weights_only=True)
    extra = saved.get("extra") if isinstance(saved, dict) else None
    return saved_rate(extra) if isinstance(extra, dict) else Fraction(-1)


def play_against_bot(policy: Policy, episodes: int, seed: int, jitter: float, waves: int, greedy: bool, replays: Path | None, build: dict[str, Any] | None = None) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    envs = ArenaEnvs(1, min(episodes, 16), seed, jitter, waves, keep_every=1 if replays is not None else 0, replays=replays, build=build)
    try:
        envs.tag("eval")
        batch = envs.reset()
        finished: list[dict[str, Any]] = []
        while len(finished) < episodes:
            with torch.no_grad():
                action, _, _ = policy.act(torch.from_numpy(batch.obs), torch.from_numpy(batch.mask), greedy=greedy)
            batch = envs.step(action.numpy())
            finished.extend(batch.finished)
        finished = finished[:episodes]
        bot = envs.bot(seed, len(finished), jitter, waves, seeds=[episode["seed"] for episode in finished], samples=False).episodes
    finally:
        envs.close()
    return finished, bot


def evaluate(path: str, run: str, episodes: int, seed: int, jitter: float, waves: int, greedy: bool, build_path: str | None = None) -> None:
    folder = RUNS / run / "eval"
    build = load_optional(build_path)
    probe = ArenaEnvs(1, 1, seed, jitter, waves, build=build)
    contract = probe.contract
    probe.close()
    policy = load(path, contract, torch.device("cpu"))
    policy.eval()
    finished, bot = play_against_bot(policy, episodes, seed, jitter, waves, greedy, folder, build)
    outcomes: dict[str, int] = {}
    for episode in finished:
        outcomes[episode["outcome"]] = outcomes.get(episode["outcome"], 0) + 1
    print(json.dumps({"build": build_name(build), "episodes": len(finished), "greedy": greedy, "outcomes": outcomes, "mean_return": float(np.mean([e["total"] for e in finished])), "mean_waves": float(np.mean([e["waves"] for e in finished])), "against_bot": paired(finished, bot), "replays": str(folder)}, indent=2))


EVAL_DUELS_AT_ONCE = 8


def evaluate_duels(path: str, run: str, duels: int, seed: int, jitter: float, greedy: bool, build_path: str | None = None) -> None:
    folder = RUNS / run / "eval"
    at_once = min(duels, EVAL_DUELS_AT_ONCE)
    build = load_optional(build_path)
    envs = ArenaEnvs(1, at_once * 2, seed, jitter, 1, keep_every=1, replays=folder, duels=at_once, build=build, rivals=example_builds() if build is not None else None)
    policy = load(path, envs.contract, torch.device("cpu"))
    policy.eval()
    envs.tag("eval-duel")
    batch = envs.reset()
    seats: list[dict[str, Any]] = []
    while len(seats) < duels * 2:
        with torch.no_grad():
            action, _, _ = policy.act(torch.from_numpy(batch.obs), torch.from_numpy(batch.mask), greedy=greedy)
        batch = envs.step(action.numpy())
        seats.extend(episode for episode in batch.finished if episode["situation"] == "duel")
    envs.close()
    seats = seats[: duels * 2]
    outcomes: dict[str, int] = {}
    for seat in seats:
        outcomes[seat["outcome"]] = outcomes.get(seat["outcome"], 0) + 1
    decided = sum(1 for seat in seats if seat["outcome"] != "timeout") / len(seats)
    print(json.dumps({"build": build_name(build), "duels": len(seats) // 2, "seat_outcomes": outcomes, "decided": decided, "mean_return": float(np.mean([seat["total"] for seat in seats])), "replays": str(folder)}, indent=2))


def match(first_path: str, second_path: str, run: str, duels: int, seed: int, jitter: float, greedy: bool, first_build_path: str | None = None, second_build_path: str | None = None) -> None:
    folder = RUNS / run / "match"
    first_build = load_optional(first_build_path)
    second_build = load_optional(second_build_path)
    probe = ArenaEnvs(1, 1, seed, jitter, 1, seats=seat_builds(first_build, second_build, 0))
    contract = probe.contract
    probe.close()
    first = load(first_path, contract, torch.device("cpu"))
    second = load(second_path, contract, torch.device("cpu"))
    first.eval()
    second.eval()
    played = play_match(first, second, duels, seed, jitter, greedy, folder, first_build, second_build)
    print(json.dumps({"first": first_path, "first_build": build_name(first_build), "second": second_path, "second_build": build_name(second_build), "greedy": greedy, "seed": seed, **score(played), "replays": str(folder)}, indent=2))


def check_build(parser: argparse.ArgumentParser, flag: str, path: str | None) -> None:
    if path is None:
        return
    try:
        probe = ArenaEnvs(1, 1, 1, 0.0, 1, build=load_optional(path))
    except (BridgeError, ValueError, OSError) as error:
        parser.error(f"{flag} {path}: {str(error).removeprefix('worker 0: ')}")
    probe.close()


def check_seed(parser: argparse.ArgumentParser, seed: int) -> None:
    if seed < 0 or seed > MAX_SEED:
        parser.error(f"--seed must be between 0 and {MAX_SEED}, which leaves room for each worker's offset under the game's limit")


def check_anchor(parser: argparse.ArgumentParser, bot_coef: float, bot_floor: float, bot_decay: int, bot_every: int, bot_episodes: int, curriculum: float) -> None:
    for name, value in (("--bot-coef", bot_coef), ("--bot-floor", bot_floor)):
        if not math.isfinite(value) or value < 0:
            parser.error(f"{name} must be a number of 0 or more")
    if bot_decay < 0:
        parser.error("--bot-decay must be 0 or more")
    if bot_every < 1:
        parser.error("--bot-every must be 1 or more")
    if bot_episodes < 1:
        parser.error("--bot-episodes must be 1 or more")
    if not math.isfinite(curriculum) or not 0 <= curriculum <= 1:
        parser.error("--curriculum must be between 0 and 1")


def check_best(parser: argparse.ArgumentParser, best_every: int, best_episodes: int, best_seed: int) -> None:
    if best_every < 0:
        parser.error("--best-every must be 0 or more")
    if best_episodes < 1:
        parser.error("--best-episodes must be 1 or more")
    if best_seed < HELD_OUT_SEED or best_seed + best_episodes > SEED_SPACE:
        parser.error(f"--best-seed must be at least {HELD_OUT_SEED}, the seeds training never plays, and leave room for --best-episodes below {SEED_SPACE}, where the game's seeds wrap")


def check_training_seed(parser: argparse.ArgumentParser, seed: int, updates: int, bot_episodes: int, workers: int, steps: int, envs: int, bot_coef: float) -> None:
    if seed + max(0, workers - 1) * WORKER_SEED_STRIDE + updates * steps * envs >= HELD_OUT_SEED:
        parser.error(f"--seed, --workers, --updates, --steps and --envs would let training arenas reach the held-out seeds from {HELD_OUT_SEED}: each worker starts {WORKER_SEED_STRIDE} past the last and takes at most one new seed per env per step")
    if bot_coef > 0 and seed + BOT_SEED_OFFSET + updates * BOT_SEED_STRIDE + max(0, workers - 1) * WORKER_SEED_STRIDE + bot_episodes >= HELD_OUT_SEED:
        parser.error(f"--seed, --updates and --workers would reach the held-out seeds from {HELD_OUT_SEED}: the bot's arenas run from --seed + {BOT_SEED_OFFSET} in steps of {BOT_SEED_STRIDE} per update, plus {WORKER_SEED_STRIDE} for each worker after the first")


def check_match(parser: argparse.ArgumentParser, duels: int, seed: int) -> None:
    if duels < 1:
        parser.error("--duels must be 1 or more")
    if seed < HELD_OUT_SEED or seed + duels + MATCH_DUELS_AT_ONCE > SEED_SPACE:
        parser.error(f"--seed must be at least {HELD_OUT_SEED}, the seeds training never plays, and leave room for the duels below {SEED_SPACE}, where the game's seeds wrap")


def check_duels(parser: argparse.ArgumentParser, duels: int, envs: int) -> None:
    if duels < 0:
        parser.error("--duels must be 0 or more")
    if duels * 2 > envs:
        parser.error(f"--duels takes two envs each, so at most {envs // 2} fit in --envs {envs}")


def check_minibatches(parser: argparse.ArgumentParser, minibatches: int, steps: int, envs: int) -> None:
    if minibatches < 1:
        parser.error("--minibatches must be 1 or more")
    if minibatches > steps * envs:
        parser.error(f"--minibatches must be at most --steps x envs ({steps * envs})")


def main() -> None:
    parser = argparse.ArgumentParser(prog="lost-storm-rl")
    sub = parser.add_subparsers(dest="command", required=True)
    widen_cmd = sub.add_parser("widen")
    widen_cmd.add_argument("--policy", required=True)
    widen_cmd.add_argument("--out", default=None)
    for name in ("imitate", "ppo", "eval"):
        command = sub.add_parser(name)
        command.add_argument("--run", default="arena")
        command.add_argument("--seed", type=int, default=1)
        command.add_argument("--jitter", type=float, default=0.2)
        command.add_argument("--waves", type=int, default=5)
        command.add_argument("--device", default="auto")
        command.add_argument("--width", type=int, default=128)
        command.add_argument("--workers", type=int, default=default_workers())
    imitate_cmd = sub.choices["imitate"]
    imitate_cmd.add_argument("--episodes", type=int, default=600)
    imitate_cmd.add_argument("--epochs", type=int, default=8)
    imitate_cmd.add_argument("--batch", type=int, default=1024)
    imitate_cmd.add_argument("--lr", type=float, default=1e-3)
    ppo_cmd = sub.choices["ppo"]
    ppo_cmd.add_argument("--start", default=None)
    ppo_cmd.add_argument("--envs", type=int, default=16)
    ppo_cmd.add_argument("--updates", type=int, default=200)
    ppo_cmd.add_argument("--steps", type=int, default=128)
    ppo_cmd.add_argument("--epochs", type=int, default=3)
    ppo_cmd.add_argument("--minibatches", type=int, default=8)
    ppo_cmd.add_argument("--lr", type=float, default=2.5e-4)
    ppo_cmd.add_argument("--gamma", type=float, default=0.995)
    ppo_cmd.add_argument("--lam", type=float, default=0.95)
    ppo_cmd.add_argument("--clip", type=float, default=0.2)
    ppo_cmd.add_argument("--entropy", type=float, default=0.005)
    ppo_cmd.add_argument("--value-coef", type=float, default=0.5)
    ppo_cmd.add_argument("--value-warmup", type=int, default=3)
    ppo_cmd.add_argument("--save-every", type=int, default=10)
    ppo_cmd.add_argument("--keep-every", type=int, default=200)
    ppo_cmd.add_argument("--duels", type=int, default=0)
    ppo_cmd.add_argument("--bot-coef", type=float, default=0.5)
    ppo_cmd.add_argument("--bot-floor", type=float, default=0.05)
    ppo_cmd.add_argument("--bot-decay", type=int, default=3000)
    ppo_cmd.add_argument("--bot-every", type=int, default=20)
    ppo_cmd.add_argument("--bot-episodes", type=int, default=16)
    ppo_cmd.add_argument("--bot-keep", type=int, default=4)
    ppo_cmd.add_argument("--curriculum", type=float, default=0.5)
    ppo_cmd.add_argument("--best-every", type=int, default=200)
    ppo_cmd.add_argument("--best-episodes", type=int, default=64)
    ppo_cmd.add_argument("--best-seed", type=int, default=BEST_SEED)
    ppo_cmd.add_argument("--build", default=None)
    eval_cmd = sub.choices["eval"]
    eval_cmd.add_argument("--policy", required=True)
    eval_cmd.add_argument("--episodes", type=int, default=16)
    eval_cmd.add_argument("--sample", action="store_true")
    eval_cmd.add_argument("--duels", action="store_true")
    eval_cmd.add_argument("--build", default=None)
    check_cmd = sub.add_parser("check")
    check_cmd.add_argument("--build", required=True)
    match_cmd = sub.add_parser("match")
    match_cmd.add_argument("--run", default="match")
    match_cmd.add_argument("--seed", type=int, default=MATCH_SEED)
    match_cmd.add_argument("--jitter", type=float, default=0.2)
    match_cmd.add_argument("--first", required=True)
    match_cmd.add_argument("--second", required=True)
    match_cmd.add_argument("--first-build", default=None)
    match_cmd.add_argument("--second-build", default=None)
    match_cmd.add_argument("--duels", type=int, default=128)
    match_cmd.add_argument("--sample", action="store_true")
    parsed = parser.parse_args()
    if parsed.command not in ("widen", "check"):
        check_seed(parser, parsed.seed)
    if parsed.command == "eval" and parsed.episodes < 1:
        parser.error("--episodes must be 1 or more")
    if parsed.command == "match":
        check_match(parser, parsed.duels, parsed.seed)
        check_build(parser, "--first-build", parsed.first_build)
        check_build(parser, "--second-build", parsed.second_build)
    if parsed.command in ("ppo", "eval", "check"):
        check_build(parser, "--build", parsed.build)
    if parsed.command == "check":
        print(f"{parsed.build}: {build_name(load_optional(parsed.build))} is a legal build")
        return
    if parsed.command == "ppo":
        check_minibatches(parser, parsed.minibatches, parsed.steps, parsed.envs * parsed.workers)
        check_duels(parser, parsed.duels, parsed.envs)
        check_anchor(parser, parsed.bot_coef, parsed.bot_floor, parsed.bot_decay, parsed.bot_every, parsed.bot_episodes, parsed.curriculum)
        check_best(parser, parsed.best_every, parsed.best_episodes, parsed.best_seed)
        check_training_seed(parser, parsed.seed, parsed.updates, parsed.bot_episodes, parsed.workers, parsed.steps, parsed.envs, parsed.bot_coef)
    torch.set_num_threads(4)
    if parsed.command == "widen":
        probe = ArenaEnvs(1, 1, 1, 0.0, 1)
        contract = probe.contract
        probe.close()
        out = parsed.out or str(Path(parsed.policy).with_name(Path(parsed.policy).stem + f"-v{contract['version']}-{contract['fingerprint']}.pt"))
        for line in widen(parsed.policy, contract, out) or ["every weight carried over unchanged"]:
            print(line)
        print(f"saved {out}")
    elif parsed.command == "imitate":
        imitate(ImitateArgs(parsed.run, parsed.episodes, parsed.workers, parsed.seed, parsed.jitter, parsed.waves, parsed.epochs, parsed.batch, parsed.lr, parsed.width, parsed.device))
    elif parsed.command == "ppo":
        ppo(PpoArgs(parsed.run, parsed.start, parsed.workers, parsed.envs, parsed.seed, parsed.jitter, parsed.waves, parsed.updates, parsed.steps, parsed.epochs, parsed.minibatches, parsed.lr, parsed.gamma, parsed.lam, parsed.clip, parsed.entropy, parsed.value_coef, parsed.value_warmup, parsed.save_every, parsed.keep_every, parsed.width, parsed.device, parsed.duels, parsed.bot_coef, parsed.bot_floor, parsed.bot_decay, parsed.bot_every, parsed.bot_episodes, parsed.bot_keep, parsed.curriculum, parsed.best_every, parsed.best_episodes, parsed.best_seed, parsed.build))
    elif parsed.command == "match":
        match(parsed.first, parsed.second, parsed.run, parsed.duels, parsed.seed, parsed.jitter, not parsed.sample, parsed.first_build, parsed.second_build)
    elif parsed.duels:
        evaluate_duels(parsed.policy, parsed.run, parsed.episodes, parsed.seed, parsed.jitter, not parsed.sample, parsed.build)
    else:
        evaluate(parsed.policy, parsed.run, parsed.episodes, parsed.seed, parsed.jitter, parsed.waves, not parsed.sample, parsed.build)


if __name__ == "__main__":
    main()
