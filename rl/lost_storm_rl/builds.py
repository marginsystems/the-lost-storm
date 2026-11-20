from __future__ import annotations

import json
from pathlib import Path
from typing import Any

EXAMPLES = Path(__file__).resolve().parents[1] / "builds"


def load_build(path: str | Path) -> dict[str, Any]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or not isinstance(raw.get("name"), str) or not raw["name"].strip():
        raise ValueError(f"{path} is not a build: it needs an object with a name, a weapon, skills and a route")
    return raw


def load_optional(path: str | None) -> dict[str, Any] | None:
    return None if path is None else load_build(path)


def example_builds(folder: Path = EXAMPLES) -> list[dict[str, Any]]:
    return [load_build(path) for path in sorted(folder.glob("*.json"))]


def build_name(build: dict[str, Any] | None) -> str | None:
    return None if build is None else str(build["name"])


def seat_builds(first: dict[str, Any] | None, second: dict[str, Any] | None, first_seat: int) -> list[dict[str, Any] | None] | None:
    if first is None and second is None:
        return None
    return [first, second] if first_seat == 0 else [second, first]
