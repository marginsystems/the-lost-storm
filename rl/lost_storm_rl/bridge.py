from __future__ import annotations

import json
import struct
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

REPO = Path(__file__).resolve().parents[2]
SERVE = REPO / "tools" / "rl" / "serve.ts"

HELLO = ord("h")
RESET = ord("r")
STEP = ord("s")
DEMO = ord("d")
TAG = ord("t")
QUIT = ord("q")
OBSERVATIONS = ord("o")
DEMONSTRATIONS = ord("D")
ERROR = ord("e")

HEADER = struct.Struct("<IB")
WORD = 4


class BridgeError(RuntimeError):
    pass


@dataclass(frozen=True)
class Batch:
    obs: np.ndarray
    mask: np.ndarray
    rewards: np.ndarray
    dones: np.ndarray
    finished: list[dict[str, Any]]


@dataclass(frozen=True)
class Demonstrations:
    obs: np.ndarray
    mask: np.ndarray
    actions: np.ndarray
    episodes: list[dict[str, Any]]
    done: bool = False


def _json_tail(payload: bytes, at: int) -> Any:
    (length,) = struct.unpack_from("<I", payload, at)
    body = payload[at + WORD : at + WORD + length]
    return json.loads(body.decode("utf-8")) if length > 0 else None


def read_batch(payload: bytes) -> Batch:
    envs, size, mask_size = struct.unpack_from("<III", payload, 0)
    at = 3 * WORD
    obs = np.frombuffer(payload, dtype=np.float32, count=envs * size, offset=at).reshape(envs, size)
    at += envs * size * WORD
    rewards = np.frombuffer(payload, dtype=np.float32, count=envs, offset=at)
    at += envs * WORD
    mask = np.frombuffer(payload, dtype=np.uint8, count=envs * mask_size, offset=at).reshape(envs, mask_size)
    at += envs * mask_size
    dones = np.frombuffer(payload, dtype=np.uint8, count=envs, offset=at)
    at += envs
    info = _json_tail(payload, at) or {}
    return Batch(obs.copy(), mask.copy(), rewards.copy(), dones.astype(bool), list(info.get("finished", [])))


def read_demonstrations(payload: bytes) -> Demonstrations:
    count, size, mask_size = struct.unpack_from("<III", payload, 0)
    at = 3 * WORD
    obs = np.frombuffer(payload, dtype=np.float32, count=count * size, offset=at).reshape(count, size)
    at += count * size * WORD
    actions = np.frombuffer(payload, dtype=np.int32, count=count * 4, offset=at).reshape(count, 4)
    at += count * 4 * WORD
    mask = np.frombuffer(payload, dtype=np.uint8, count=count * mask_size, offset=at).reshape(count, mask_size)
    at += count * mask_size
    info = _json_tail(payload, at) or {}
    return Demonstrations(obs.copy(), mask.copy(), actions.copy(), list(info.get("episodes", [])), bool(info.get("done", False)))


class Worker:
    def __init__(self, index: int, replays: Path | None) -> None:
        command = ["node", str(SERVE), "--worker", str(index)]
        if replays is not None:
            command += ["--replays", str(replays)]
        self.index = index
        self.process = subprocess.Popen(command, cwd=REPO, stdin=subprocess.PIPE, stdout=subprocess.PIPE)

    def send(self, kind: int, payload: bytes = b"") -> None:
        stdin = self.process.stdin
        if stdin is None:
            raise BridgeError(f"worker {self.index} has no input pipe")
        stdin.write(HEADER.pack(len(payload), kind) + payload)
        stdin.flush()

    def send_json(self, kind: int, value: Any) -> None:
        self.send(kind, json.dumps(value).encode("utf-8"))

    def _read(self, count: int) -> bytes:
        stdout = self.process.stdout
        if stdout is None:
            raise BridgeError(f"worker {self.index} has no output pipe")
        chunks: list[bytes] = []
        left = count
        while left > 0:
            chunk = stdout.read(left)
            if not chunk:
                raise BridgeError(f"worker {self.index} closed its output (exit code {self.process.poll()})")
            chunks.append(chunk)
            left -= len(chunk)
        return b"".join(chunks)

    def receive(self, expected: int) -> bytes:
        length, kind = HEADER.unpack(self._read(HEADER.size))
        payload = self._read(length)
        if kind == ERROR:
            raise BridgeError(f"worker {self.index}: {_json_tail(payload, 0)}")
        if kind != expected:
            raise BridgeError(f"worker {self.index} answered {chr(kind)!r}, expected {chr(expected)!r}")
        return payload

    def close(self) -> None:
        if self.process.poll() is None:
            try:
                self.send(QUIT)
            except (BrokenPipeError, BridgeError):
                pass
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()


class ArenaEnvs:
    def __init__(self, workers: int, envs_per_worker: int, seed: int, jitter: float, waves: int, keep_every: int = 0, replays: Path | None = None) -> None:
        self.workers: list[Worker] = []
        self.envs_per_worker = envs_per_worker
        self.count = workers * envs_per_worker
        try:
            for index in range(workers):
                self.workers.append(Worker(index, replays))
            for index, worker in enumerate(self.workers):
                worker.send_json(HELLO, {"seed": seed + index * 1_000_003, "envs": envs_per_worker, "jitter": jitter, "waves": waves, "keepEvery": keep_every})
            hellos = [json.loads(worker.receive(HELLO)[WORD:].decode("utf-8")) for worker in self.workers]
        except BaseException:
            self.close()
            raise
        self.contract: dict[str, Any] = hellos[0]

    def _gather(self) -> Batch:
        parts = [read_batch(worker.receive(OBSERVATIONS)) for worker in self.workers]
        finished: list[dict[str, Any]] = []
        for index, part in enumerate(parts):
            for episode in part.finished:
                finished.append({**episode, "env": episode["env"] + index * self.envs_per_worker})
        return Batch(
            np.concatenate([part.obs for part in parts]),
            np.concatenate([part.mask for part in parts]),
            np.concatenate([part.rewards for part in parts]),
            np.concatenate([part.dones for part in parts]),
            finished,
        )

    def reset(self) -> Batch:
        for worker in self.workers:
            worker.send(RESET)
        return self._gather()

    def step(self, actions: np.ndarray) -> Batch:
        chosen = np.ascontiguousarray(actions, dtype=np.int32).reshape(self.count, 4)
        for index, worker in enumerate(self.workers):
            part = chosen[index * self.envs_per_worker : (index + 1) * self.envs_per_worker]
            worker.send(STEP, part.astype("<i4").tobytes())
        return self._gather()

    def tag(self, label: str) -> None:
        for worker in self.workers:
            worker.send_json(TAG, {"tag": label})
        for worker in self.workers:
            worker.receive(TAG)

    def close(self) -> None:
        for worker in self.workers:
            worker.close()


def _stream(worker: Worker) -> list[Demonstrations]:
    parts: list[Demonstrations] = []
    while True:
        part = read_demonstrations(worker.receive(DEMONSTRATIONS))
        parts.append(part)
        if part.done:
            return parts


def demonstrations(workers: int, episodes: int, seed: int, jitter: float, waves: int) -> Demonstrations:
    pool = [Worker(index, None) for index in range(workers)]
    try:
        share = max(1, episodes // workers)
        for index, worker in enumerate(pool):
            worker.send_json(DEMO, {"seed": seed + index * share, "episodes": share, "jitter": jitter, "waves": waves})
        parts = [part for worker in pool for part in _stream(worker)]
    finally:
        for worker in pool:
            worker.close()
    return Demonstrations(
        np.concatenate([part.obs for part in parts]),
        np.concatenate([part.mask for part in parts]),
        np.concatenate([part.actions for part in parts]),
        [episode for part in parts for episode in part.episodes],
    )
