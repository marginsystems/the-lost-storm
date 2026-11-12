import math
import os
import sys
from typing import Callable

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from mathutils import Vector

from environment_kit import Kit, export

WALL_LENGTH: float = 4.0
WALL_HALF: float = WALL_LENGTH / 2.0
WALL_HEIGHT: float = 3.4
WALL_THICKNESS: float = 1.0
LOW_HEIGHT: float = 1.0
DRY_HEIGHT: float = 1.45
FRONT: float = -1.0


def level(kit: Kit, count: int, height: float, wobble: float) -> list[float]:
    return [height + kit.spread(wobble) for _ in range(count)]


def footing(kit: Kit, thickness: float, height: float) -> None:
    kit.box("stone", 0.0, 0.0, 0.0, WALL_LENGTH, thickness + 0.14, height)


def coping(kit: Kit, height: float, thickness: float, count: int) -> None:
    width: float = WALL_LENGTH / count
    for index in range(count):
        kit.box("stone", -WALL_HALF + width * (index + 0.5), 0.0, height - 0.02, width - 0.03, thickness + 0.1, 0.16 + kit.spread(0.03), jitter=0.015)


def wall_a(kit: Kit) -> None:
    footing(kit, WALL_THICKNESS, 0.45)
    kit.courses("stone", -WALL_HALF, WALL_HALF, 0.0, WALL_THICKNESS, level(kit, 8, WALL_HEIGHT, 0.04))
    coping(kit, WALL_HEIGHT, WALL_THICKNESS, 6)


def wall_b(kit: Kit) -> None:
    footing(kit, WALL_THICKNESS, 0.45)
    kit.courses("stone", -WALL_HALF, WALL_HALF, 0.0, WALL_THICKNESS, [3.4, 3.4, 3.15, 3.15, 3.4, 3.4, 3.2, 3.4])
    kit.box("stone", 0.0, FRONT * 0.68, 0.0, 1.0, 0.5, 2.3)
    kit.box("stone", 0.0, FRONT * 0.6, 2.3, 1.0, 0.62, 0.5, tilt_x=-0.6)
    kit.box("stone", 0.0, FRONT * 0.72, 0.0, 1.2, 0.6, 0.5)


def wall_ruin(kit: Kit) -> None:
    footing(kit, WALL_THICKNESS, 0.45)
    kit.courses("stone", -WALL_HALF, WALL_HALF, 0.0, WALL_THICKNESS, [3.4, 3.05, 2.4, 1.75, 1.3, 1.6, 2.5, 3.2], jitter=0.05)
    kit.scatter_blocks("stone", 7, -1.4, 1.2, FRONT * 1.0, FRONT * 0.62, 0.25, 0.5)
    kit.box("stone", 0.1, 0.05, 1.3, 0.55, 0.5, 0.3, yaw=0.5, tilt_y=0.2, jitter=0.03)


def wall_window(kit: Kit) -> None:
    footing(kit, WALL_THICKNESS, 0.45)
    kit.courses("stone", -WALL_HALF, -0.6, 0.0, WALL_THICKNESS, level(kit, 3, WALL_HEIGHT, 0.03))
    kit.courses("stone", 0.6, WALL_HALF, 0.0, WALL_THICKNESS, level(kit, 3, WALL_HEIGHT, 0.03))
    kit.box("stone", 0.0, 0.0, 0.0, 1.2, WALL_THICKNESS, 1.3)
    kit.box("stone", 0.0, 0.0, 2.55, 1.3, WALL_THICKNESS + 0.04, WALL_HEIGHT - 2.55)
    kit.box("stone", -0.48, 0.0, 2.3, 0.26, WALL_THICKNESS, 0.3)
    kit.box("stone", 0.48, 0.0, 2.3, 0.26, WALL_THICKNESS, 0.3)
    kit.box("stone", 0.0, 0.0, 1.3, 1.36, WALL_THICKNESS + 0.16, 0.1)
    for x in (-0.3, 0.0, 0.3):
        kit.rod("iron", (x, 0.0, 1.35), (x, 0.0, 2.6), 0.028)
    kit.rod("iron", (-0.6, 0.0, 1.95), (0.6, 0.0, 1.95), 0.024)
    coping(kit, WALL_HEIGHT, WALL_THICKNESS, 6)


def scaffold(kit: Kit, y: float, top: float) -> None:
    for x in (-1.75, 0.0, 1.75):
        kit.box("wood", x, y, 0.0, 0.12, 0.12, top + 0.25)
    for z in (1.6, top):
        kit.beam("wood", (-1.9, y, z), (1.9, y, z), 0.09, 0.09)
        kit.box("wood", 0.0, y + 0.2, z + 0.05, 3.7, 0.34, 0.05, jitter=0.01)
    kit.beam("wood", (-1.75, y - 0.02, 0.2), (0.0, y - 0.02, 1.6), 0.07, 0.07)
    kit.beam("wood", (1.75, y - 0.02, 1.7), (0.0, y - 0.02, top), 0.07, 0.07)


def wall_scaffold(kit: Kit) -> None:
    footing(kit, 0.7, 0.45)
    kit.courses("stone", -WALL_HALF, WALL_HALF, 0.14, 0.72, level(kit, 8, WALL_HEIGHT, 0.04))
    scaffold(kit, FRONT * 0.42, 3.0)


def wall_works(kit: Kit) -> None:
    footing(kit, WALL_THICKNESS, 0.45)
    kit.courses("stone", -WALL_HALF, WALL_HALF, 0.0, WALL_THICKNESS, [1.5, 1.7, 1.25, 0.95, 1.1, 1.5, 1.35, 1.7], jitter=0.04)
    for x in (-1.8, 0.0, 1.8):
        kit.box("wood", x, 0.0, 0.9, 0.14, 0.14, WALL_HEIGHT - 0.9)
    kit.beam("wood", (-2.0, 0.0, WALL_HEIGHT), (2.0, 0.0, WALL_HEIGHT), 0.14, 0.14)
    kit.beam("wood", (-1.8, 0.0, 1.9), (0.0, 0.0, WALL_HEIGHT), 0.09, 0.09)
    kit.beam("wood", (1.8, 0.0, 1.9), (0.0, 0.0, WALL_HEIGHT), 0.09, 0.09)
    kit.scatter_blocks("stone", 4, -1.2, 1.2, FRONT * 0.95, FRONT * 0.65, 0.3, 0.5)


def wall_low(kit: Kit) -> None:
    kit.courses("stone", -WALL_HALF, WALL_HALF, 0.0, 0.6, level(kit, 8, LOW_HEIGHT, 0.03))
    coping(kit, LOW_HEIGHT, 0.6, 6)


def wall_low_piers(kit: Kit) -> None:
    wall_low(kit)
    for x in (-1.35, 1.35):
        kit.box("stone", x, 0.0, 0.0, 0.5, 0.78, 1.38)
        kit.box("stone", x, 0.0, 1.38, 0.62, 0.9, 0.12)


def pier(kit: Kit) -> None:
    kit.box("stone", 0.0, 0.0, 0.0, 1.52, 1.52, 0.5)
    kit.box("stone", 0.0, 0.0, 0.5, 1.3, 1.3, 3.2, jitter=0.02)
    kit.box("stone", 0.0, 0.0, 3.7, 1.5, 1.5, 0.22)
    kit.box("stone", 0.0, 0.0, 3.92, 1.05, 1.05, 0.2)


def drystone(kit: Kit, heights: list[float], thickness: float, loose: int) -> None:
    kit.courses("stone", -WALL_HALF, WALL_HALF, 0.0, thickness, heights, jitter=0.07)
    count: int = len(heights)
    width: float = WALL_LENGTH / count
    for index, height in enumerate(heights):
        if height < 0.5:
            continue
        kit.box("stone", -WALL_HALF + width * (index + 0.5), kit.spread(0.08), height - 0.05, width * 0.9, thickness * 0.8, 0.14 + kit.spread(0.05), yaw=kit.spread(0.25), tilt_y=kit.spread(0.12), jitter=0.03)
    kit.scatter_blocks("stone", loose, -1.8, 1.8, FRONT * 0.75, FRONT * 0.5, 0.18, 0.36)


def drystone_a(kit: Kit) -> None:
    drystone(kit, level(kit, 10, DRY_HEIGHT, 0.12), 0.8, 2)


def drystone_b(kit: Kit) -> None:
    drystone(kit, [1.5, 1.35, 1.45, 1.2, 1.3, 1.5, 1.42, 1.25, 1.38, 1.5], 0.8, 3)


def drystone_gap(kit: Kit) -> None:
    drystone(kit, [1.5, 1.3, 1.0, 0.6, 0.3, 0.35, 0.7, 1.1, 1.4, 1.5], 0.8, 8)


def drystone_low(kit: Kit) -> None:
    drystone(kit, level(kit, 10, 0.72, 0.1), 0.7, 1)


def cairn(kit: Kit) -> None:
    kit.box("stone", 0.0, 0.0, 0.0, 1.0, 1.0, 0.7, yaw=0.1, jitter=0.05)
    kit.box("stone", 0.02, -0.02, 0.7, 0.85, 0.85, 0.6, yaw=-0.2, jitter=0.05)
    kit.box("stone", -0.02, 0.03, 1.3, 0.66, 0.66, 0.45, yaw=0.3, jitter=0.04)
    kit.box("stone", 0.0, 0.0, 1.75, 0.42, 0.42, 0.22, yaw=0.7, jitter=0.03)


def pillar(kit: Kit) -> None:
    kit.box("stone", 0.0, 0.0, 0.0, 1.7, 1.7, 0.4)
    kit.box("stone", 0.0, 0.0, 0.4, 1.3, 1.3, 3.0, jitter=0.015)
    kit.box("stone", 0.0, 0.0, 3.4, 1.5, 1.5, 0.16)
    kit.box("stone", 0.0, 0.0, 3.56, 1.72, 1.72, 0.3)


def column(kit: Kit) -> None:
    kit.box("stone", 0.0, 0.0, 0.0, 1.0, 1.0, 0.3)
    kit.cylinder("stone", 0.0, 0.0, 0.3, 0.44, 0.14, segments=14)
    kit.cylinder("stone", 0.0, 0.0, 0.44, 0.37, 2.6, segments=14, top=0.33)
    kit.cylinder("stone", 0.0, 0.0, 3.04, 0.42, 0.14, segments=14)
    kit.box("stone", 0.0, 0.0, 3.18, 0.96, 0.96, 0.26)


def column_broken(kit: Kit) -> None:
    kit.box("stone", 0.0, 0.0, 0.0, 1.0, 1.0, 0.3)
    kit.cylinder("stone", 0.0, 0.0, 0.3, 0.44, 0.14, segments=14)
    kit.cylinder("stone", 0.0, 0.0, 0.44, 0.37, 1.0, segments=14, top=0.36, tilt_x=0.03)
    kit.cylinder("stone", 0.35, -0.45, 0.33, 0.35, 0.8, segments=14, tilt_x=math.pi / 2.0, yaw=0.9)
    kit.scatter_blocks("stone", 3, -0.5, 0.5, -0.5, 0.5, 0.16, 0.3)


def plinth(kit: Kit) -> None:
    kit.box("stone", 0.0, 0.0, 0.0, 2.7, 2.7, 0.36)
    kit.box("stone", 0.0, 0.0, 0.36, 2.2, 2.2, 0.34)
    kit.box("stone", 0.0, 0.0, 0.7, 1.8, 1.8, 0.3)


def statue_base(kit: Kit) -> None:
    kit.box("stone", 0.0, 0.0, 0.0, 1.5, 1.5, 0.3)
    kit.box("stone", 0.0, 0.0, 0.3, 1.1, 1.1, 0.95, jitter=0.01)
    kit.box("stone", 0.0, 0.0, 1.25, 1.3, 1.3, 0.15)


def stairs(kit: Kit) -> None:
    for index in range(8):
        kit.box("stone", 0.0, FRONT * (1.8 - 0.45 * (index + 0.5)), 0.0, 3.0, 0.47, 0.3 * (index + 1), jitter=0.012)
    for x in (-1.72, 1.72):
        kit.box("stone", x, 0.0, 0.0, 0.46, 3.7, 0.9)
        kit.box("stone", x, 0.9, 0.9, 0.46, 1.9, 1.3 + kit.spread(0.2))
        kit.box("stone", x, 1.5, 2.2, 0.46, 0.7, 0.7)
    kit.scatter_blocks("stone", 6, -1.6, 1.6, 1.9, 2.4, 0.25, 0.5)


def doorway(kit: Kit) -> None:
    for x in (-1.55, 1.55):
        kit.box("stone", x, 0.0, 0.0, 0.9, WALL_THICKNESS, 3.6, jitter=0.015)
        kit.box("stone", x, 0.0, 0.0, 1.0, WALL_THICKNESS + 0.14, 0.5)
    kit.box("stone", 0.0, 0.0, 2.7, 2.3, WALL_THICKNESS + 0.06, 0.9)
    kit.box("stone", 0.0, 0.0, 3.6, 4.1, WALL_THICKNESS + 0.14, 0.2)
    kit.box("void", 0.0, 0.3, 0.0, 2.2, 0.3, 2.7)
    for x in (-0.55, 0.55):
        kit.box("wood", x, 0.08, 0.02, 1.06, 0.1, 2.66, jitter=0.006)
        for z in (0.5, 1.4, 2.3):
            kit.box("iron", x, 0.02, z, 1.0, 0.03, 0.09)
    kit.box("stone", 0.0, FRONT * 0.75, 0.0, 2.6, 0.7, 0.1)


def grate(kit: Kit) -> None:
    kit.box("void", 0.0, 0.0, 0.0, 3.5, 3.5, 0.02)
    for index in range(12):
        kit.box("iron", -1.65 + index * 0.3, 0.0, 0.02, 0.07, 3.5, 0.06)
    for y in (-1.2, 0.0, 1.2):
        kit.box("iron", 0.0, y, 0.03, 3.5, 0.1, 0.07)
    for x in (-1.78, 1.78):
        kit.box("stone", x, 0.0, 0.0, 0.3, 3.86, 0.1)
    for y in (-1.78, 1.78):
        kit.box("stone", 0.0, y, 0.0, 3.86, 0.3, 0.1)


def mound(kit: Kit, rx: float, ry: float, rz: float, blocks: int) -> None:
    kit.blob("earth", 0.0, 0.0, 0.0, rx, ry, rz, 0.3, detail=3)
    for _ in range(blocks):
        x: float = kit.spread(rx * 0.92)
        y: float = kit.spread(ry * 0.9)
        rise: float = rz * math.sqrt(max(0.0, 1.0 - (x / rx) ** 2 - (y / ry) ** 2))
        size: float = 0.3 + kit.rng.random() * 0.55
        kit.box("stone", x, y, rise * 0.8 - size * 0.2, size * (1.0 + kit.rng.random() * 0.8), size, size * 0.6, yaw=kit.rng.random() * math.pi, tilt_x=kit.spread(0.5), tilt_y=kit.spread(0.5), jitter=size * 0.05)


def rubble_large(kit: Kit) -> None:
    mound(kit, 3.7, 1.5, 1.7, 34)
    kit.beam("wood", (-2.4, -0.6, 0.3), (0.4, 0.2, 1.9), 0.2, 0.2)
    kit.beam("wood", (2.6, -0.9, 0.1), (0.9, 0.4, 1.5), 0.16, 0.16)


def rubble_small(kit: Kit) -> None:
    mound(kit, 1.9, 1.3, 1.1, 16)


def loose_blocks(kit: Kit) -> None:
    kit.scatter_blocks("stone", 6, -0.8, 0.8, -0.6, 0.6, 0.25, 0.55)


def torch(kit: Kit) -> None:
    kit.box("iron", 0.0, FRONT * 0.02, -0.28, 0.12, 0.04, 0.4)
    kit.rod("iron", (0.0, FRONT * 0.03, -0.12), (0.0, FRONT * 0.3, -0.02), 0.022)
    kit.rod("wood", (0.0, FRONT * 0.26, -0.3), (0.0, FRONT * 0.42, 0.42), 0.04)
    kit.cylinder("iron", 0.0, FRONT * 0.42, 0.38, 0.06, 0.14, segments=8, top=0.1, tilt_x=0.2)
    kit.flame(0.0, FRONT * 0.44, 0.54, 0.2)


def post(kit: Kit) -> None:
    kit.box("wood", 0.0, 0.0, 0.0, 0.22, 0.22, 3.3, jitter=0.008)
    kit.beam("wood", (0.0, 0.05, 3.0), (0.0, FRONT * 1.25, 3.0), 0.13, 0.13)
    kit.beam("wood", (0.0, 0.0, 2.35), (0.0, FRONT * 0.62, 2.98), 0.09, 0.09)
    kit.box("stone", 0.0, 0.0, 0.0, 0.5, 0.5, 0.22, jitter=0.03)


def hanging_lantern(kit: Kit, lit: bool) -> None:
    y: float = FRONT * 1.05
    kit.rod("iron", (0.0, y, 2.94), (0.0, y, 2.72), 0.015)
    kit.cylinder("iron", 0.0, y, 2.6, 0.19, 0.12, segments=8, top=0.03)
    kit.cylinder("iron", 0.0, y, 2.18, 0.15, 0.05, segments=8)
    for index in range(4):
        angle: float = math.pi / 4.0 + index * math.pi / 2.0
        dx: float = math.cos(angle) * 0.14
        dy: float = math.sin(angle) * 0.14
        kit.rod("iron", (dx, y + dy, 2.2), (dx, y + dy, 2.62), 0.014, segments=4)
    kit.box("glow" if lit else "void", 0.0, y, 2.24, 0.17, 0.17, 0.34)


def post_lantern(kit: Kit) -> None:
    post(kit)
    hanging_lantern(kit, False)


def post_lantern_lit(kit: Kit) -> None:
    post(kit)
    hanging_lantern(kit, True)


def great_lamp(kit: Kit, lit: bool) -> None:
    kit.cylinder("iron", 0.0, 0.0, 0.0, 0.62, 0.2, segments=12, top=0.5)
    kit.cylinder("iron", 0.0, 0.0, 0.2, 0.16, 1.3, segments=10, top=0.12)
    kit.cylinder("iron", 0.0, 0.0, 1.5, 0.3, 0.3, segments=12, top=0.78)
    kit.cylinder("iron", 0.0, 0.0, 1.8, 0.8, 0.1, segments=12)
    for index in range(8):
        angle: float = index * math.pi / 4.0
        kit.rod("iron", (math.cos(angle) * 0.74, math.sin(angle) * 0.74, 1.88), (math.cos(angle) * 0.6, math.sin(angle) * 0.6, 3.1), 0.035)
    kit.cylinder("iron", 0.0, 0.0, 3.08, 0.66, 0.1, segments=12)
    kit.cylinder("iron", 0.0, 0.0, 3.18, 0.72, 0.6, segments=12, top=0.08)
    kit.cylinder("iron", 0.0, 0.0, 3.78, 0.08, 0.3, segments=6, top=0.02)
    if lit:
        kit.blob("glow", 0.0, 0.0, 2.0, 0.5, 0.5, 0.22, 0.05)
        kit.flame(0.0, 0.0, 2.25, 0.5)
    else:
        kit.blob("void", 0.0, 0.0, 1.98, 0.5, 0.5, 0.2, 0.08)


def great_lamp_dark(kit: Kit) -> None:
    great_lamp(kit, False)


def great_lamp_lit(kit: Kit) -> None:
    great_lamp(kit, True)


def candles(kit: Kit) -> None:
    kit.cylinder("iron", 0.0, 0.0, 0.0, 0.2, 0.02, segments=10)
    for x, y, height in ((0.0, 0.05, 0.36), (-0.1, -0.05, 0.24), (0.11, -0.04, 0.29)):
        kit.cylinder("wax", x, y, 0.02, 0.035, height, segments=8)
        kit.flame(x, y, 0.05 + height, 0.045)


def shrine(kit: Kit) -> None:
    kit.box("stone", 0.0, 0.0, 0.0, 1.0, 1.0, 0.5, jitter=0.02)
    kit.box("stone", 0.0, 0.36, 0.5, 1.0, 0.26, 1.0, jitter=0.02)
    kit.box("stone", 0.0, 0.25, 1.5, 1.14, 0.56, 0.14)
    kit.box("stone", 0.0, 0.25, 1.64, 0.8, 0.4, 0.14)
    for x, y, height in ((-0.28, -0.1, 0.3), (-0.06, 0.02, 0.22), (0.14, -0.14, 0.34), (0.32, 0.0, 0.18)):
        kit.cylinder("wax", x, y, 0.5, 0.04, height, segments=8)
        kit.flame(x, y, 0.53 + height, 0.05)


def brazier(kit: Kit) -> None:
    for index in range(3):
        angle: float = index * math.pi * 2.0 / 3.0
        kit.rod("iron", (math.cos(angle) * 0.5, math.sin(angle) * 0.5, 0.0), (math.cos(angle) * 0.2, math.sin(angle) * 0.2, 0.95), 0.03)
    kit.cylinder("iron", 0.0, 0.0, 0.85, 0.26, 0.3, segments=12, top=0.52)
    kit.cylinder("iron", 0.0, 0.0, 1.15, 0.55, 0.05, segments=12)
    kit.blob("glow", 0.0, 0.0, 1.16, 0.42, 0.42, 0.12, 0.04)
    kit.flame(0.0, 0.0, 1.32, 0.34)


def banner(kit: Kit, half: float, strips: int, emblem: bool) -> None:
    y: float = FRONT * 0.6
    kit.rod("iron", (-half - 0.12, y, 3.5), (half + 0.12, y, 3.5), 0.03)
    for x in (-half - 0.06, half + 0.06):
        kit.rod("iron", (x, FRONT * 0.5, 3.5), (x, y - 0.02, 3.5), 0.025)
    width: float = half * 2.0 / strips
    for index in range(strips):
        length: float = 2.1 + kit.rng.random() * 0.6
        kit.sheet("cloth", (-half + width * index + 0.006, y - 0.03, 3.5), (width - 0.012, 0.0, 0.0), (0.0, 0.0, -length), 3, 8, 0.1, ragged=0.07, pinned=False)
    if emblem:
        kit.cylinder("iron", 0.0, y - 0.07, 2.5, 0.36, 0.04, segments=14, tilt_x=math.pi / 2.0)
        kit.cylinder("iron", 0.0, y - 0.11, 2.5, 0.12, 0.06, segments=10, tilt_x=math.pi / 2.0)


def banner_narrow(kit: Kit) -> None:
    banner(kit, 0.62, 3, False)


def banner_wide(kit: Kit) -> None:
    banner(kit, 1.0, 5, True)


def trestle(kit: Kit, y: float, lean: float) -> None:
    kit.beam("wood", (-0.42, y, 0.0), (-0.12, y, 0.78), 0.07, 0.09)
    kit.beam("wood", (0.42, y, 0.0), (0.12, y, 0.78), 0.07, 0.09)
    kit.beam("wood", (-0.3, y, 0.3 + lean), (0.3, y, 0.3 + lean), 0.05, 0.07)


def table_broken(kit: Kit) -> None:
    for x in (-0.31, 0.0):
        kit.box("wood", x, 0.2, 0.4, 0.3, 3.3, 0.06, tilt_x=-0.24, jitter=0.01)
    kit.box("wood", 0.5, -0.3, 0.02, 0.3, 2.6, 0.06, yaw=0.5, tilt_y=0.05)
    trestle(kit, 1.2, 0.0)
    kit.beam("wood", (-0.5, -1.4, 0.05), (0.4, -1.1, 0.09), 0.07, 0.09)
    kit.beam("wood", (-0.2, -1.7, 0.04), (0.3, -1.9, 0.5), 0.07, 0.09)


def bench(kit: Kit) -> None:
    kit.box("wood", 0.0, 0.0, 0.44, 2.0, 0.38, 0.06, jitter=0.006)
    for x in (-0.8, 0.8):
        kit.box("wood", x, 0.0, 0.0, 0.07, 0.34, 0.44)
    kit.beam("wood", (-0.8, 0.0, 0.2), (0.8, 0.0, 0.2), 0.05, 0.07)


def gravestone(kit: Kit) -> None:
    kit.box("stone", 0.0, 0.0, 0.0, 0.95, 0.42, 0.14, jitter=0.02)
    kit.box("stone", 0.0, 0.0, 0.1, 0.7, 0.16, 1.0, tilt_x=0.07, tilt_y=0.03)
    kit.cylinder("stone", 0.0, 0.01, 1.1, 0.35, 0.16, segments=14, tilt_x=math.pi / 2.0 + 0.07)


def grave_cross(kit: Kit) -> None:
    kit.box("stone", 0.0, 0.0, 0.0, 0.5, 0.36, 0.12, jitter=0.02)
    kit.box("stone", 0.0, 0.0, 0.08, 0.2, 0.14, 1.25, tilt_x=-0.08, tilt_y=0.06)
    kit.box("stone", 0.05, 0.07, 0.78, 0.74, 0.14, 0.2, tilt_x=-0.08, tilt_y=0.06)


def grave_slab(kit: Kit) -> None:
    kit.box("stone", 0.0, 0.0, 0.0, 0.95, 2.0, 0.2, jitter=0.02)
    kit.box("stone", 0.0, 0.0, 0.2, 0.75, 1.8, 0.1, jitter=0.015)
    kit.box("stone", 0.0, 1.05, 0.0, 0.8, 0.18, 1.15, tilt_x=0.05)


def house(kit: Kit, width: float, depth: float, height: float, roof: float, windows: tuple[float, ...], door: float | None) -> None:
    hw: float = width / 2.0
    hd: float = depth / 2.0
    front: float = FRONT * hd
    kit.box("stone", 0.0, 0.0, 0.0, width + 0.12, depth + 0.12, 0.6, jitter=0.01)
    kit.box("plaster", 0.0, 0.0, 0.6, width, depth, height - 0.6)
    steps: int = 6
    for index in range(steps):
        span: float = depth * (1.0 - (index + 0.5) / steps)
        for x in (-hw + 0.1, hw - 0.1):
            kit.box("plaster", x, 0.0, height + roof * index / steps, 0.2, span, roof / steps + 0.01)
    for x in (-hw, hw):
        for y in (-hd, hd):
            kit.box("wood", x, y, 0.5, 0.2, 0.2, height - 0.5)
    for y in (-hd - 0.02, hd + 0.02):
        kit.beam("wood", (-hw, y, height - 0.08), (hw, y, height - 0.08), 0.18, 0.18)
        kit.beam("wood", (-hw, y, 1.9), (hw, y, 1.9), 0.12, 0.12)
        for index in range(1, 4):
            x: float = -hw + width * index / 4.0
            kit.box("wood", x, y, 0.6, 0.13, 0.13, height - 0.6)
        kit.beam("wood", (-hw + 0.1, y, 1.95), (-hw + width / 4.0, y, height - 0.1), 0.1, 0.1)
        kit.beam("wood", (hw - 0.1, y, 1.95), (hw - width / 4.0, y, height - 0.1), 0.1, 0.1)
    for x in (-hw - 0.02, hw + 0.02):
        kit.beam("wood", (x, -hd, height - 0.08), (x, hd, height - 0.08), 0.18, 0.18)
        kit.beam("wood", (x, -hd, 1.9), (x, hd, 1.9), 0.12, 0.12)
        kit.box("wood", x, 0.0, 0.6, 0.13, 0.13, height + roof * 0.55)
    slope: float = math.atan2(roof, hd + 0.45)
    length: float = math.hypot(roof, hd + 0.45) + 0.2
    for side in (-1.0, 1.0):
        kit.box("roof", 0.0, side * (hd + 0.45) / 2.0, height + roof / 2.0 - 0.12, width + 0.8, length, 0.16, tilt_x=-side * slope)
    kit.beam("roof", (-hw - 0.42, 0.0, height + roof + 0.02), (hw + 0.42, 0.0, height + roof + 0.02), 0.26, 0.2)
    kit.box("stone", hw * 0.45, hd * 0.3, height + roof * 0.3, 0.7, 0.7, roof * 0.7 + 0.9, jitter=0.012)
    for x in windows:
        kit.box("glow", x, front - 0.02, 1.25, 0.6, 0.06, 0.75)
        kit.box("wood", x, front - 0.06, 1.15, 0.8, 0.08, 0.1)
        kit.box("wood", x, front - 0.06, 2.0, 0.8, 0.08, 0.1)
        kit.box("wood", x, front - 0.07, 1.25, 0.05, 0.05, 0.75)
    if door is not None:
        kit.box("wood", door, front - 0.04, 0.3, 1.0, 0.1, 2.0, jitter=0.005)
        kit.box("stone", door, front - 0.4, 0.0, 1.4, 0.7, 0.3)


def house_a(kit: Kit) -> None:
    house(kit, 6.2, 5.0, 3.1, 2.7, (-1.9, 1.9), 0.0)


def house_b(kit: Kit) -> None:
    house(kit, 4.6, 4.4, 3.9, 3.0, (0.9,), -0.9)


def stall(kit: Kit) -> None:
    front: float = FRONT * 0.78
    back: float = 0.78
    for x in (-1.4, 1.4):
        kit.box("wood", x, front, 0.0, 0.11, 0.11, 2.08, yaw=kit.spread(0.08), jitter=0.006)
        kit.box("wood", x, back, 0.0, 0.11, 0.11, 2.56, yaw=kit.spread(0.08), jitter=0.006)
        kit.beam("wood", (x, front - 0.12, 2.0), (x, back + 0.12, 2.5), 0.07, 0.09)
        kit.beam("wood", (x, front, 0.5), (x, back, 0.5), 0.05, 0.08)
        kit.beam("wood", (x, front, 1.1), (x, back, 1.75), 0.04, 0.06)
    kit.beam("wood", (-1.56, front, 2.06), (1.56, front, 2.06), 0.07, 0.09)
    kit.beam("wood", (-1.56, back, 2.54), (1.56, back, 2.54), 0.07, 0.09)
    kit.beam("wood", (-1.4, back, 1.2), (1.4, back, 1.2), 0.05, 0.08)
    for index in range(4):
        kit.box("wood", 0.0, front + 0.1 + index * 0.185, 0.86 + kit.spread(0.006), 2.96 + kit.spread(0.05), 0.175, 0.045, yaw=kit.spread(0.006), jitter=0.004)
    for x in (-0.9, 0.0, 0.9):
        kit.beam("wood", (x, front + 0.02, 0.82), (x, front + 0.72, 0.82), 0.06, 0.07)
    for index in range(11):
        height: float = 0.74 + kit.spread(0.03)
        kit.box("wood", -1.29 + index * 0.258, front - 0.03, 0.06, 0.24, 0.028, height, tilt_y=kit.spread(0.012))
    kit.beam("wood", (-1.4, front - 0.05, 0.3), (1.4, front - 0.05, 0.3), 0.04, 0.07)
    for index in range(5):
        x: float = -1.56 + index * 0.78
        kit.beam("wood", (x, front - 0.2, 2.03), (x, back + 0.18, 2.6), 0.05, 0.06)
    for index in range(4):
        kit.sheet("cloth", (-1.6 + index * 0.8, back + 0.2, 2.66), (0.8, 0.0, 0.0), (0.0, front - back - 0.42, -0.6), 4, 6, 0.2 + kit.rng.random() * 0.08)
    kit.sheet("cloth", (-1.62, front - 0.22, 2.11), (3.24, 0.0, 0.0), (0.0, -0.03, -0.42), 12, 3, 0.03, ragged=0.35, pinned=False)
    kit.sheet("cloth", (-1.45, back + 0.03, 2.5), (2.9, 0.0, 0.0), (0.0, 0.02, -1.5), 8, 6, 0.05, ragged=0.12, pinned=False)


def dead_tree(kit: Kit, height: float, girth: float, depth: int) -> None:
    kit.cylinder("bark", 0.0, 0.0, -0.1, girth * 1.7, 0.5, segments=8, top=girth)
    kit.limb("bark", Vector((0.0, 0.0, 0.3)), Vector((kit.spread(0.12), kit.spread(0.12), 1.0)), height, girth, depth)


def dead_tree_large(kit: Kit) -> None:
    dead_tree(kit, 4.2, 0.3, 2)


def dead_tree_medium(kit: Kit) -> None:
    dead_tree(kit, 3.2, 0.22, 2)


def dead_tree_small(kit: Kit) -> None:
    dead_tree(kit, 2.3, 0.15, 1)


def coins(kit: Kit) -> None:
    for index in range(5):
        kit.cylinder("gold", kit.spread(0.012), kit.spread(0.012), index * 0.034, 0.15, 0.03, segments=12)
    for index in range(3):
        kit.cylinder("gold", 0.3 + kit.spread(0.012), -0.08 + kit.spread(0.012), index * 0.034, 0.15, 0.03, segments=12)
    kit.cylinder("gold", -0.2, 0.26, 0.0, 0.15, 0.03, segments=12)
    kit.cylinder("gold", -0.16, -0.24, 0.02, 0.15, 0.03, segments=12, tilt_x=0.5)
    kit.cylinder("gold", 0.12, 0.3, 0.01, 0.15, 0.03, segments=12, tilt_y=-0.4)


MODELS: dict[str, Callable[[Kit], None]] = {
    "wall_a": wall_a,
    "wall_b": wall_b,
    "wall_ruin": wall_ruin,
    "wall_window": wall_window,
    "wall_scaffold": wall_scaffold,
    "wall_works": wall_works,
    "wall_low": wall_low,
    "wall_low_piers": wall_low_piers,
    "pier": pier,
    "drystone_a": drystone_a,
    "drystone_b": drystone_b,
    "drystone_gap": drystone_gap,
    "drystone_low": drystone_low,
    "cairn": cairn,
    "pillar": pillar,
    "column": column,
    "column_broken": column_broken,
    "plinth": plinth,
    "statue_base": statue_base,
    "stairs": stairs,
    "doorway": doorway,
    "grate": grate,
    "rubble_large": rubble_large,
    "rubble_small": rubble_small,
    "loose_blocks": loose_blocks,
    "torch": torch,
    "post": post,
    "post_lantern": post_lantern,
    "post_lantern_lit": post_lantern_lit,
    "great_lamp": great_lamp_dark,
    "great_lamp_lit": great_lamp_lit,
    "candles": candles,
    "shrine": shrine,
    "brazier": brazier,
    "banner": banner_narrow,
    "banner_wide": banner_wide,
    "table_broken": table_broken,
    "bench": bench,
    "gravestone": gravestone,
    "grave_cross": grave_cross,
    "grave_slab": grave_slab,
    "house_a": house_a,
    "house_b": house_b,
    "stall": stall,
    "dead_tree_large": dead_tree_large,
    "dead_tree_medium": dead_tree_medium,
    "dead_tree_small": dead_tree_small,
    "coins": coins,
}


def main() -> None:
    arguments: list[str] = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(arguments) < 1:
        raise SystemExit("usage: blender -b --python blender/build_environment.py -- <output dir> [only=<id>,<id>]")
    target: str = arguments[0]
    only: set[str] = set()
    for argument in arguments[1:]:
        if argument.startswith("only="):
            only.update(argument[5:].split(","))
    os.makedirs(target, exist_ok=True)
    for index, (name, build) in enumerate(MODELS.items()):
        if only and name not in only:
            continue
        kit: Kit = Kit(1000 + index)
        build(kit)
        triangles: int = export(kit, os.path.join(target, f"{name}.glb"))
        print(f"built {name}: {triangles} triangles")


main()
