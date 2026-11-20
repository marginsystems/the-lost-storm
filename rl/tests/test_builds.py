from __future__ import annotations

from pathlib import Path

import pytest

from lost_storm_rl.bridge import hello
from lost_storm_rl.builds import build_name, example_builds, load_build, seat_builds

SPIN = {"name": "Spin", "weapon": "warden_broadsword", "skills": [], "route": []}
WALL = {"name": "Wall", "weapon": "iron_maul", "skills": [], "route": []}


def test_every_example_build_loads_with_its_own_name() -> None:
    builds = example_builds()
    names = [build_name(build) for build in builds]
    assert len(builds) >= 4
    assert len(set(names)) == len(names)


def test_a_file_that_is_not_a_build_is_refused(tmp_path: Path) -> None:
    junk = tmp_path / "junk.json"
    junk.write_text('["Spin"]', encoding="utf-8")
    with pytest.raises(ValueError):
        load_build(junk)
    nameless = tmp_path / "nameless.json"
    nameless.write_text('{"name": " ", "weapon": "iron_maul"}', encoding="utf-8")
    with pytest.raises(ValueError):
        load_build(nameless)


def test_each_model_keeps_its_build_when_the_seats_swap() -> None:
    assert seat_builds(SPIN, WALL, 0) == [SPIN, WALL]
    assert seat_builds(SPIN, WALL, 1) == [WALL, SPIN]
    assert seat_builds(SPIN, None, 1) == [None, SPIN]
    assert seat_builds(None, None, 1) is None


def test_hello_sends_builds_only_when_there_are_some() -> None:
    plain = hello(1, 2, 1, 0.2, 1, 0, [], None, None, None)
    assert "build" not in plain and "rivals" not in plain and "seats" not in plain
    built = hello(1, 2, 1, 0.2, 1, 0, [], SPIN, [WALL], [SPIN, WALL])
    assert built["build"] == SPIN and built["rivals"] == [WALL] and built["seats"] == [SPIN, WALL]
