from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import torch
from torch import nn
from torch.distributions import Categorical

NEG = -1e9


@dataclass(frozen=True)
class Shape:
    self_size: int
    slot_size: int
    slots: int
    entity_size: int
    entities: int
    rays: int
    heads: tuple[int, ...]
    targets: int

    @staticmethod
    def of(contract: dict[str, Any]) -> "Shape":
        layout = contract["layout"]
        heads = tuple(int(choice) for choice in contract["heads"])
        return Shape(layout["self"], layout["slot"], layout["slots"], layout["entity"], layout["entities"], layout["rays"], heads, heads[2])


@dataclass(frozen=True)
class Split:
    self_part: torch.Tensor
    slots: torch.Tensor
    entities: torch.Tensor
    rays: torch.Tensor


def split(shape: Shape, obs: torch.Tensor) -> Split:
    at = 0
    self_part = obs[:, at : at + shape.self_size]
    at += shape.self_size
    slots = obs[:, at : at + shape.slot_size * shape.slots].reshape(-1, shape.slots, shape.slot_size)
    at += shape.slot_size * shape.slots
    entities = obs[:, at : at + shape.entity_size * shape.entities].reshape(-1, shape.entities, shape.entity_size)
    at += shape.entity_size * shape.entities
    rays = obs[:, at : at + shape.rays]
    return Split(self_part, slots, entities, rays)


def head_masks(shape: Shape, mask: torch.Tensor) -> list[torch.Tensor]:
    out: list[torch.Tensor] = []
    at = 0
    for choices in shape.heads:
        out.append(mask[:, at : at + choices] > 0)
        at += choices
    return out


def embed(width: int, size: int) -> nn.Sequential:
    return nn.Sequential(nn.Linear(size, width), nn.GELU(), nn.Linear(width, width))


class Policy(nn.Module):
    def __init__(self, contract: dict[str, Any], width: int = 128, layers: int = 2, attention_heads: int = 4) -> None:
        super().__init__()
        self.contract = {key: contract[key] for key in ("version", "fingerprint", "layout", "heads", "self", "slot", "entity") if key in contract}
        self.shape = Shape.of(contract)
        shape = self.shape
        self.width = width
        self.self_in = embed(width, shape.self_size + shape.rays)
        self.slot_in = embed(width, shape.slot_size)
        self.entity_in = embed(width, shape.entity_size)
        self.kind = nn.Parameter(torch.zeros(3, width))
        layer = nn.TransformerEncoderLayer(width, attention_heads, width * 2, dropout=0.0, batch_first=True, norm_first=True)
        self.mixer = nn.TransformerEncoder(layer, layers, enable_nested_tensor=False)
        self.norm = nn.LayerNorm(width)
        self.trunk = nn.Sequential(nn.Linear(width * 2, width * 2), nn.GELU(), nn.Linear(width * 2, width), nn.GELU())
        self.move = nn.Linear(width, shape.heads[0])
        self.skip_skill = nn.Linear(width, 1)
        self.skill_query = nn.Linear(width, width)
        self.target_query = nn.Linear(width, width)
        self.flask = nn.Linear(width, shape.heads[3])
        self.value = nn.Sequential(nn.Linear(width, width), nn.GELU(), nn.Linear(width, 1))

    def features(self, obs: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        shape = self.shape
        parts = split(shape, obs)
        hero = self.self_in(torch.cat([parts.self_part, parts.rays], dim=1)).unsqueeze(1) + self.kind[0]
        slots = self.slot_in(parts.slots) + self.kind[1]
        entities = self.entity_in(parts.entities) + self.kind[2]
        tokens = torch.cat([hero, slots, entities], dim=1)
        absent = torch.cat([torch.zeros_like(parts.slots[:, :1, 0], dtype=torch.bool), parts.slots[:, :, 0] <= 0, parts.entities[:, :, 0] <= 0], dim=1)
        mixed = self.norm(self.mixer(tokens, src_key_padding_mask=absent))
        present = (~absent[:, 1:]).unsqueeze(-1).float()
        pooled = (mixed[:, 1:] * present).sum(dim=1) / present.sum(dim=1).clamp(min=1.0)
        state = self.trunk(torch.cat([mixed[:, 0], pooled], dim=1))
        return state, mixed[:, 1 : 1 + shape.slots], mixed[:, 1 + shape.slots : 1 + shape.slots + shape.targets]

    def logits(self, obs: torch.Tensor, mask: torch.Tensor) -> tuple[list[torch.Tensor], torch.Tensor]:
        state, slots, targets = self.features(obs)
        scale = self.width ** -0.5
        skill = torch.einsum("bw,bsw->bs", self.skill_query(state), slots) * scale
        target = torch.einsum("bw,btw->bt", self.target_query(state), targets) * scale
        raw = [self.move(state), torch.cat([self.skip_skill(state), skill], dim=1), target, self.flask(state)]
        masked = [logit.masked_fill(~allowed, NEG) for logit, allowed in zip(raw, head_masks(self.shape, mask))]
        return masked, self.value(state).squeeze(-1)

    def act(self, obs: torch.Tensor, mask: torch.Tensor, greedy: bool = False) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        logits, value = self.logits(obs, mask)
        dists = [Categorical(logits=logit) for logit in logits]
        actions = torch.stack([logit.argmax(dim=1) if greedy else dist.sample() for logit, dist in zip(logits, dists)], dim=1)
        return actions, joint_log_prob(dists, actions), value

    def evaluate(self, obs: torch.Tensor, mask: torch.Tensor, actions: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        logits, value = self.logits(obs, mask)
        dists = [Categorical(logits=logit) for logit in logits]
        return joint_log_prob(dists, actions), joint_entropy(dists, actions), value


def target_matters(actions: torch.Tensor) -> torch.Tensor:
    return (actions[:, 1] > 0).float()


def joint_log_prob(dists: list[Categorical], actions: torch.Tensor) -> torch.Tensor:
    parts = [dist.log_prob(actions[:, index]) for index, dist in enumerate(dists)]
    parts[2] = parts[2] * target_matters(actions)
    return torch.stack(parts, dim=1).sum(dim=1)


def joint_entropy(dists: list[Categorical], actions: torch.Tensor) -> torch.Tensor:
    parts = [dist.entropy() for dist in dists]
    parts[2] = parts[2] * target_matters(actions)
    return torch.stack(parts, dim=1).sum(dim=1)


def save(policy: Policy, path: str, extra: dict[str, Any] | None = None) -> None:
    torch.save({"contract": policy.contract, "width": policy.width, "state": policy.state_dict(), "extra": extra or {}}, path)


def load(path: str, contract: dict[str, Any], device: torch.device) -> Policy:
    saved = torch.load(path, map_location=device, weights_only=True)
    if saved["contract"]["fingerprint"] != contract["fingerprint"]:
        raise ValueError(
            f"checkpoint {path} was trained on contract v{saved['contract']['version']} ({saved['contract']['fingerprint']}), "
            f"the game now speaks v{contract['version']} ({contract['fingerprint']}); "
            f"run `python -m lost_storm_rl.train widen --policy {path}` to carry the weights over"
        )
    policy = Policy(contract, width=saved["width"]).to(device)
    policy.load_state_dict(saved["state"])
    return policy


def input_names(contract: dict[str, Any]) -> dict[str, list[str]] | None:
    if not all(key in contract for key in ("self", "slot", "entity")):
        return None
    rays = [f"ray_{index}" for index in range(contract["layout"]["rays"])]
    return {"self_in.0.weight": list(contract["self"]) + rays, "slot_in.0.weight": list(contract["slot"]), "entity_in.0.weight": list(contract["entity"])}


def carry(old: torch.Tensor, fresh: torch.Tensor, old_names: list[str] | None, new_names: list[str] | None) -> torch.Tensor:
    if old_names is not None and new_names is not None:
        out = fresh.clone()
        out[:, :] = 0.0
        rows = min(old.shape[0], fresh.shape[0])
        where = {name: index for index, name in enumerate(old_names)}
        for column, name in enumerate(new_names):
            if name in where:
                out[:rows, column] = old[:rows, where[name]]
        return out
    overlap = tuple(slice(0, min(a, b)) for a, b in zip(old.shape, fresh.shape))
    out = fresh.clone()
    if out.dim() >= 2:
        out[overlap[0], overlap[1]] = 0.0
    out[overlap] = old[overlap]
    return out


def widen(path: str, contract: dict[str, Any], out: str) -> list[str]:
    saved = torch.load(path, map_location="cpu", weights_only=True)
    policy = Policy(contract, width=saved["width"])
    fresh = policy.state_dict()
    old_inputs = input_names(saved["contract"])
    new_inputs = input_names(contract)
    changed: list[str] = []
    for name, tensor in fresh.items():
        old = saved["state"].get(name)
        if old is None:
            changed.append(f"{name}: new")
            continue
        named = old_inputs is not None and new_inputs is not None and name in new_inputs
        if old.shape == tensor.shape and not (named and old_inputs[name] != new_inputs[name]):
            fresh[name] = old.clone()
            continue
        if old.dim() != tensor.dim():
            changed.append(f"{name}: shape {tuple(old.shape)} -> {tuple(tensor.shape)}, kept fresh")
            continue
        fresh[name] = carry(old, tensor, old_inputs[name] if named and old_inputs is not None else None, new_inputs[name] if named and new_inputs is not None else None)
        changed.append(f"{name}: {tuple(old.shape)} -> {tuple(tensor.shape)}{' by feature name' if named else ''}")
    policy.load_state_dict(fresh)
    save(policy, out, {**saved.get("extra", {}), "widened_from": path, "from_contract": saved["contract"]})
    return changed
