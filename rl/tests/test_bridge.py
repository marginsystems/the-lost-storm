from __future__ import annotations

import argparse
import json
import struct

import numpy as np
import pytest
import torch

from lost_storm_rl.bridge import read_batch, read_demonstrations
from lost_storm_rl.model import Policy
from lost_storm_rl.train import check_minibatches


def contract() -> dict[str, object]:
    return {"version": 1, "fingerprint": "test", "layout": {"self": 5, "slot": 4, "slots": 2, "entity": 3, "entities": 3, "rays": 2, "size": 5 + 8 + 9 + 2, "mask": 9 + 3 + 2 + 3}, "heads": [9, 3, 2, 3]}


def test_read_batch_follows_the_frame_layout() -> None:
    obs = np.array([[1.5, -2.0]], dtype=np.float32)
    info = json.dumps({"finished": [{"env": 0, "outcome": "won"}]}).encode()
    payload = struct.pack("<III", 1, 2, 3) + obs.tobytes() + np.array([0.25], dtype=np.float32).tobytes() + bytes([1, 0, 1]) + bytes([1]) + struct.pack("<I", len(info)) + info
    batch = read_batch(payload)
    assert batch.obs.tolist() == [[1.5, -2.0]]
    assert batch.rewards.tolist() == [0.25]
    assert batch.mask.tolist() == [[1, 0, 1]]
    assert batch.dones.tolist() == [True]
    assert batch.finished == [{"env": 0, "outcome": "won"}]


def test_read_demonstrations_keeps_actions_aligned() -> None:
    obs = np.zeros((2, 2), dtype=np.float32)
    actions = np.array([[1, 2, 3, 0], [4, 0, 0, 1]], dtype=np.int32)
    payload = struct.pack("<III", 2, 2, 1) + obs.tobytes() + actions.tobytes() + bytes([1, 1]) + struct.pack("<I", 0)
    data = read_demonstrations(payload)
    assert data.actions.tolist() == actions.tolist()
    assert data.mask.shape == (2, 1)


def test_policy_respects_the_mask() -> None:
    shape = contract()
    policy = Policy(shape, width=16, layers=1, attention_heads=2)
    obs = torch.zeros(4, 24)
    obs[:, 5] = 1
    obs[:, 13] = 1
    mask = torch.zeros(4, 17, dtype=torch.uint8)
    mask[:, 3] = 1
    mask[:, 9] = 1
    mask[:, 12] = 1
    mask[:, 14] = 1
    actions, log_prob, value = policy.act(obs, mask)
    assert actions[:, 0].tolist() == [3, 3, 3, 3]
    assert actions[:, 1].tolist() == [0, 0, 0, 0]
    assert actions[:, 3].tolist() == [0, 0, 0, 0]
    assert torch.isfinite(log_prob).all() and value.shape == (4,)


def named(self_names: list[str]) -> dict[str, object]:
    base = contract()
    layout = {**base["layout"], "self": len(self_names), "size": len(self_names) + 8 + 9 + 2}
    return {**base, "fingerprint": "-".join(self_names), "layout": layout, "self": self_names, "slot": ["s0", "s1", "s2", "s3"], "entity": ["present", "e1", "e2"]}


def test_widen_carries_weights_by_feature_name(tmp_path) -> None:
    from lost_storm_rl.model import save, widen

    old = Policy(named(["a", "b", "c", "d", "e"]), width=16, layers=1, attention_heads=2)
    path = str(tmp_path / "old.pt")
    save(old, path)
    out = str(tmp_path / "grown.pt")
    changed = widen(path, named(["a", "b", "new", "c", "d", "e"]), out)
    assert any("by feature name" in line for line in changed)
    new_in = torch.load(out, weights_only=False)["state"]["self_in.0.weight"]
    old_in = old.state_dict()["self_in.0.weight"]
    assert torch.equal(new_in[:, 0:2], old_in[:, 0:2])
    assert torch.equal(new_in[:, 2], torch.zeros_like(new_in[:, 2]))
    assert torch.equal(new_in[:, 3:8], old_in[:, 2:7])
    assert torch.equal(torch.load(out, weights_only=False)["state"]["move.weight"], old.state_dict()["move.weight"])


def test_streamed_demonstrations_say_when_they_end() -> None:
    info = json.dumps({"episodes": [], "done": True}).encode("utf-8")
    payload = struct.pack("<III", 0, 3, 2) + struct.pack("<I", len(info)) + info
    data = read_demonstrations(payload)
    assert data.done
    assert data.obs.shape == (0, 3)
    assert data.actions.shape == (0, 4)


def test_minibatch_counts_outside_the_batch_are_refused() -> None:
    parser = argparse.ArgumentParser()
    check_minibatches(parser, 8, 128, 16)
    for bad in (0, 128 * 16 + 1):
        with pytest.raises(SystemExit):
            check_minibatches(parser, bad, 128, 16)
