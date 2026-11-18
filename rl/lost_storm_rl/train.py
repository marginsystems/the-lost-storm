from __future__ import annotations

import argparse
import csv
import json
import os
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch.distributions import Categorical

from .bridge import MAX_SEED, ArenaEnvs, demonstrations
from .model import Policy, head_masks, load, save, widen

RUNS = Path(__file__).resolve().parents[1] / "runs"


def pick_device(name: str) -> torch.device:
    if name == "auto":
        return torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    return torch.device(name)


def default_workers() -> int:
    return max(1, min(12, (os.cpu_count() or 4) - 4))


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
            logits, _ = policy.logits(batch_obs, batch_mask)
            loss = torch.zeros((), device=device)
            allowed = head_masks(policy.shape, batch_mask)
            for head, logit in enumerate(logits):
                label = batch_actions[:, head]
                valid = allowed[head].gather(1, label.unsqueeze(1)).squeeze(1)
                if head == 2:
                    valid = valid & (batch_actions[:, 1] > 0)
                if not bool(valid.any()):
                    continue
                part = -Categorical(logits=logit[valid]).log_prob(label[valid]).mean()
                loss = loss + part
                totals[head] += part.item() * int(valid.sum())
                correct[head] += float((logit[valid].argmax(dim=1) == label[valid]).float().sum())
                seen[head] += int(valid.sum())
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(policy.parameters(), 1.0)
            optimizer.step()
        accuracy = " ".join(f"{name}={correct[i] / max(1, seen[i]):.3f}" for i, name in enumerate(("move", "skill", "target", "flask")))
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


def explained(values: np.ndarray, returns: np.ndarray) -> float:
    spread = np.var(returns)
    return float("nan") if spread == 0 else float(1 - np.var(returns - values) / spread)


def ppo(args: PpoArgs) -> Path:
    folder = RUNS / args.run
    replays = folder / "replays"
    folder.mkdir(parents=True, exist_ok=True)
    envs = ArenaEnvs(args.workers, args.envs, args.seed, args.jitter, args.waves, args.keep_every, replays)
    contract = envs.contract
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
    log_path = folder / "log.csv"
    fresh_log = not log_path.exists()
    log_file = log_path.open("a", newline="")
    log = csv.writer(log_file)
    if fresh_log:
        log.writerow(["update", "decisions", "seconds", "episodes", "win_rate", "died_rate", "mean_return", "mean_waves", "policy_loss", "value_loss", "entropy", "explained", "kl"])
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
            stats = {"policy": 0.0, "value": 0.0, "entropy": 0.0, "kl": 0.0, "n": 0}
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
            episodes = len(finished)
            win = sum(1 for episode in finished if episode["outcome"] == "won") / max(1, episodes)
            died = sum(1 for episode in finished if episode["outcome"] == "died") / max(1, episodes)
            mean_return = float(np.mean([episode["total"] for episode in finished])) if finished else float("nan")
            mean_waves = float(np.mean([episode["waves"] for episode in finished])) if finished else float("nan")
            seconds = time.time() - started
            ev = explained(val_buf.reshape(-1), returns.reshape(-1))
            row = [update, decisions, round(seconds, 1), episodes, round(win, 3), round(died, 3), round(mean_return, 3), round(mean_waves, 3), round(stats["policy"] / n, 4), round(stats["value"] / n, 4), round(stats["entropy"] / n, 4), round(ev, 3), round(stats["kl"] / n, 5)]
            log.writerow(row)
            log_file.flush()
            print(f"update {update} | {decisions / max(1.0, seconds):.0f} dec/s | episodes {episodes} won {win:.0%} died {died:.0%} return {mean_return:.2f} waves {mean_waves:.2f} | entropy {stats['entropy'] / n:.2f} ev {ev:.2f}{' (value warmup)' if warming else ''}", flush=True)
            if update % args.save_every == 0 or update == args.updates:
                save(policy, str(folder / f"policy-u{update:05d}.pt"), {"stage": "ppo", "update": update, "args": asdict(args)})
                save(policy, str(folder / "latest.pt"), {"stage": "ppo", "update": update, "args": asdict(args)})
    finally:
        log_file.close()
        envs.close()
    return folder / "latest.pt"


def evaluate(path: str, run: str, episodes: int, seed: int, jitter: float, waves: int, greedy: bool) -> None:
    folder = RUNS / run / "eval"
    envs = ArenaEnvs(1, min(episodes, 16), seed, jitter, waves, keep_every=1, replays=folder)
    policy = load(path, envs.contract, torch.device("cpu"))
    policy.eval()
    envs.tag("eval")
    batch = envs.reset()
    finished: list[dict[str, Any]] = []
    while len(finished) < episodes:
        with torch.no_grad():
            action, _, _ = policy.act(torch.from_numpy(batch.obs), torch.from_numpy(batch.mask), greedy=greedy)
        batch = envs.step(action.numpy())
        finished.extend(batch.finished)
    envs.close()
    finished = finished[:episodes]
    outcomes: dict[str, int] = {}
    for episode in finished:
        outcomes[episode["outcome"]] = outcomes.get(episode["outcome"], 0) + 1
    print(json.dumps({"episodes": len(finished), "outcomes": outcomes, "mean_return": float(np.mean([e["total"] for e in finished])), "mean_waves": float(np.mean([e["waves"] for e in finished])), "replays": str(folder)}, indent=2))


def check_seed(parser: argparse.ArgumentParser, seed: int) -> None:
    if seed < 0 or seed > MAX_SEED:
        parser.error(f"--seed must be between 0 and {MAX_SEED}, which leaves room for each worker's offset under the game's limit")


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
    eval_cmd = sub.choices["eval"]
    eval_cmd.add_argument("--policy", required=True)
    eval_cmd.add_argument("--episodes", type=int, default=16)
    eval_cmd.add_argument("--sample", action="store_true")
    parsed = parser.parse_args()
    if parsed.command != "widen":
        check_seed(parser, parsed.seed)
    if parsed.command == "ppo":
        check_minibatches(parser, parsed.minibatches, parsed.steps, parsed.envs * parsed.workers)
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
        ppo(PpoArgs(parsed.run, parsed.start, parsed.workers, parsed.envs, parsed.seed, parsed.jitter, parsed.waves, parsed.updates, parsed.steps, parsed.epochs, parsed.minibatches, parsed.lr, parsed.gamma, parsed.lam, parsed.clip, parsed.entropy, parsed.value_coef, parsed.value_warmup, parsed.save_every, parsed.keep_every, parsed.width, parsed.device))
    else:
        evaluate(parsed.policy, parsed.run, parsed.episodes, parsed.seed, parsed.jitter, parsed.waves, not parsed.sample)


if __name__ == "__main__":
    main()
