import math
import os
import sys
from typing import Callable

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from bmesh.types import BMVert
from mathutils import Matrix, Vector

from environment_kit import PALETTE, Kit, export
from road_figures import figure, fitted, standing_scale

PALETTE["skin"] = ((0.55, 0.42, 0.34), 0.0, 0.8, False)
PALETTE["reed"] = ((0.38, 0.34, 0.2), 0.0, 0.9, False)

FACE: float = 2.05


def fan(kit: Kit, name: str, cx: float, y: float, cz: float, radius: float, sectors: int, skip: set[int]) -> None:
    target = kit.mesh(name)
    center = target.verts.new((cx, y, cz))
    ring = [target.verts.new((cx + math.cos(i * math.tau / sectors) * radius, y, cz + math.sin(i * math.tau / sectors) * radius)) for i in range(sectors)]
    for i in range(sectors):
        if i in skip:
            continue
        face = target.faces.new((center, ring[(i + 1) % sectors], ring[i]))
        face.normal_update()
        if face.normal.y > 0.0:
            face.normal_flip()


def tilted_about(kit: Kit, existing: dict[str, set[BMVert]], pivot: Vector, axis: str, angle: float) -> None:
    turn = Matrix.Rotation(angle, 4, axis)
    for name, made in kit.parts.items():
        if name not in existing:
            continue
        for vert in made.verts:
            if vert not in existing[name]:
                vert.co = pivot + turn @ (vert.co - pivot)


def snapshot(kit: Kit) -> dict[str, set[BMVert]]:
    return {name: set(made.verts) for name, made in kit.parts.items()}


def grounded(kit: Kit, sink: float) -> None:
    low = min(vert.co.z for made in kit.parts.values() for vert in made.verts)
    for made in kit.parts.values():
        for vert in made.verts:
            vert.co.z += sink - low


def ring_beams(kit: Kit, name: str, center: tuple[float, float, float], radius: float, count: int, width: float, depth: float) -> None:
    points = [(center[0] + math.cos(i * math.tau / count) * radius, center[1], center[2] + math.sin(i * math.tau / count) * radius) for i in range(count + 1)]
    for i in range(count):
        kit.beam(name, points[i], points[i + 1], width, depth)


def clock(kit: Kit, cracked: bool) -> None:
    kit.box("stone", 0.0, 0.0, 0.0, 0.7, 0.52, 0.3, yaw=0.04, jitter=0.012)
    kit.box("stone", 0.0, 0.0, 0.3, 0.6, 0.44, 0.1, yaw=0.02, jitter=0.01)
    kit.box("wood", 0.0, 0.0, 0.4, 0.5, 0.36, 0.34, tilt_y=0.01, jitter=0.006)
    kit.box("wood", 0.0, 0.0, 0.74, 0.42, 0.3, 1.0, tilt_y=0.015, jitter=0.008)
    kit.box("wood", 0.0, -0.155, 0.9, 0.3, 0.03, 0.7)
    kit.box("wood", 0.0, -0.17, 0.86, 0.34, 0.03, 0.05)
    kit.box("wood", 0.0, -0.17, 1.6, 0.34, 0.03, 0.05)
    kit.rod("iron", (0.0, -0.18, 1.5), (0.03, -0.18, 1.0), 0.008, segments=4)
    kit.cylinder("iron", 0.03, -0.17, 0.98, 0.075, 0.03, segments=10, tilt_x=math.pi / 2.0)
    kit.box("wood", 0.0, 0.0, 1.74, 0.54, 0.36, 0.1, jitter=0.008)
    kit.box("wood", 0.0, 0.0, 1.84, 0.46, 0.32, 0.5, tilt_y=-0.01, jitter=0.008)
    kit.box("wood", -0.265, -0.02, 1.8, 0.06, 0.3, 0.58, jitter=0.006)
    kit.box("wood", 0.265, -0.02, 1.8, 0.06, 0.3, 0.58, jitter=0.006)
    kit.box("wood", 0.0, 0.0, 2.34, 0.62, 0.42, 0.08, jitter=0.01)
    kit.box("wood", 0.0, 0.0, 2.42, 0.44, 0.3, 0.06, jitter=0.006)
    kit.cylinder("iron", 0.0, 0.0, 2.48, 0.035, 0.1, segments=6, top=0.01)
    ring_beams(kit, "iron", (0.0, -0.175, FACE), 0.2, 14, 0.04, 0.07)
    fan(kit, "iron", 0.0, -0.165, FACE, 0.19, 12, set())
    fan(kit, "plaster", 0.0, -0.17, FACE, 0.19, 12, {2, 3, 7} if cracked else set())
    for i in range(12):
        t = i * math.tau / 12.0
        kit.box("iron", math.cos(t) * 0.16, -0.18, FACE + math.sin(t) * 0.16 - 0.012, 0.022, 0.012, 0.024)
    kit.beam("iron", (0.0, -0.186, FACE), (0.03, -0.186, FACE + 0.14), 0.016, 0.012)
    kit.beam("iron", (0.0, -0.19, FACE), (0.09, -0.19, FACE - 0.05), 0.02, 0.012)
    kit.cylinder("iron", 0.0, -0.18, FACE, 0.025, 0.02, segments=8, tilt_x=math.pi / 2.0)
    if cracked:
        kit.beam("iron", (-0.17, -0.19, FACE + 0.1), (-0.05, -0.19, FACE - 0.03), 0.008, 0.01)
        kit.beam("iron", (-0.05, -0.19, FACE - 0.03), (-0.08, -0.19, FACE - 0.15), 0.008, 0.01)
        kit.beam("iron", (-0.05, -0.19, FACE - 0.03), (0.06, -0.19, FACE + 0.05), 0.008, 0.01)
        kit.box("wood", -0.28, -0.12, 2.2, 0.07, 0.05, 0.2, tilt_y=0.5)


def standing_clock(kit: Kit) -> None:
    clock(kit, False)


def standing_clock_tilted(kit: Kit) -> None:
    clock(kit, True)
    tilted_about(kit, {name: set() for name in kit.parts}, Vector((0.0, 0.0, 0.0)), "Y", math.radians(-12.0))
    grounded(kit, -0.03)
    kit.box("stone", 0.45, -0.05, -0.1, 0.34, 0.3, 0.3, yaw=0.4, tilt_x=0.2, jitter=0.02)
    kit.box("stone", 0.3, 0.3, -0.1, 0.26, 0.24, 0.24, yaw=1.0, jitter=0.02)


def great_doors(kit: Kit) -> None:
    kit.box("stone", 0.0, -0.1, 0.0, 7.6, 2.0, 0.18, jitter=0.012)
    for side in (-1.0, 1.0):
        z = 0.18
        for height, width, push in ((1.3, 1.05, 0.0), (1.15, 0.96, 0.05), (1.25, 1.02, -0.03), (1.2, 0.98, 0.04), (1.0, 1.0, 0.0)):
            kit.box("stone", side * 3.0 + side * push, 0.0, z, width, 1.5, height - 0.02, jitter=0.02)
            z += height
    kit.box("stone", 0.0, 0.0, 6.08, 7.2, 1.5, 0.5, jitter=0.015)
    kit.box("stone", 0.0, -0.04, 6.58, 7.4, 1.56, 0.4, jitter=0.015)
    for x in (-2.4, -0.8, 0.8, 2.4):
        kit.box("stone", x, -0.78, 6.2, 0.3, 0.12, 0.7)
    kit.box("stone", 0.0, 0.0, 6.98, 5.4, 1.3, 0.9, jitter=0.02)
    kit.box("stone", 0.0, -0.05, 7.86, 4.0, 1.4, 0.16, jitter=0.01)
    center = 7.35
    kit.cylinder("stone", 0.0, -0.58, center, 0.72, 0.16, segments=24, tilt_x=math.pi / 2.0)
    kit.cylinder("stone", 0.0, -0.7, center, 0.58, 0.07, segments=24, tilt_x=math.pi / 2.0)
    for i in range(12):
        t = i * math.tau / 12.0
        kit.box("stone", math.cos(t) * 0.65, -0.76, center + math.sin(t) * 0.65 - 0.04, 0.07, 0.06, 0.12 if i % 3 == 0 else 0.08)
    kit.beam("stone", (0.0, -0.8, center), (0.0, -0.8, center + 0.48), 0.08, 0.06)
    kit.beam("stone", (0.0, -0.8, center), (0.34, -0.8, center - 0.14), 0.07, 0.06)
    kit.cylinder("stone", 0.0, -0.74, center, 0.07, 0.08, segments=8, tilt_x=math.pi / 2.0)
    for side in (-1.0, 1.0):
        for index in range(5):
            kit.box("wood", side * (0.06 + 0.5 * index + 0.25) + kit.spread(0.004), 0.1, 0.18, 0.49, 0.2, 5.9 + kit.spread(0.05), jitter=0.01)
        for z in (0.9, 2.7, 4.5):
            kit.box("iron", side * 1.3, -0.02, z, 2.34, 0.06, 0.2 + kit.spread(0.02))
            for x in (0.4, 1.3, 2.2):
                kit.cylinder("iron", side * x, -0.04, z + 0.1, 0.045, 0.05, segments=6, tilt_x=math.pi / 2.0)
        kit.cylinder("iron", side * 0.85, -0.04, 2.6, 0.17, 0.06, segments=10, tilt_x=math.pi / 2.0)
        ring_beams(kit, "iron", (side * 0.85, -0.1, 2.2), 0.4, 14, 0.07, 0.07)
    kit.box("iron", 0.0, -0.02, 2.4, 0.12, 0.08, 0.3)


def wide_stair(kit: Kit) -> None:
    steps = 6
    run = 4.0 / steps
    for index in range(steps):
        front = -2.0 + index * run
        for half in (-1.0, 1.0):
            kit.box("stone", half * 2.0, (front + 2.0) / 2.0, -0.05, 4.02 - 0.02 * index, 2.0 - front + kit.spread(0.02), 0.3 * (index + 1) + 0.05 + kit.spread(0.01), jitter=0.035, yaw=kit.spread(0.01), tilt_y=kit.spread(0.012))
    kit.scatter_blocks("stone", 6, -3.8, 3.8, -2.7, -2.0, 0.1, 0.24)


def cart_wheel(kit: Kit, cx: float, cy: float, cz: float, radius: float, lean: float) -> None:
    def at(t: float, rr: float) -> tuple[float, float, float]:
        u, v = math.cos(t) * rr, math.sin(t) * rr
        return (cx + lean * v, cy + u, cz + v)

    count = 10
    for i in range(count):
        t0, t1 = i * math.tau / count, (i + 1) * math.tau / count
        kit.beam("wood", at(t0, radius * 0.94), at(t1, radius * 0.94), 0.1, 0.1)
        kit.beam("iron", at(t0, radius), at(t1, radius), 0.03, 0.12)
    for i in range(8):
        t = i * math.tau / 8.0 + 0.2
        kit.rod("wood", at(t, 0.0), at(t, radius * 0.92), 0.026, segments=5, top=0.02)
    kit.cylinder("wood", cx - 0.1, cy, cz, 0.1, 0.2, segments=8, tilt_y=math.pi / 2.0)


def sunken_cart(kit: Kit) -> None:
    cart_wheel(kit, 0.62, 0.0, 0.2, 0.72, 0.1)
    cart_wheel(kit, -0.62, 0.0, -0.3, 0.72, 0.0)
    kit.rod("iron", (-0.7, 0.0, -0.3), (0.74, 0.0, 0.2), 0.045, segments=6)
    before = snapshot(kit)
    for index in range(6):
        kit.box("wood", -0.52 + index * 0.2 + kit.spread(0.01), 0.0, 0.42 + kit.spread(0.015), 0.19, 1.9 + kit.spread(0.08), 0.05, jitter=0.008)
    kit.box("wood", -0.62, 0.0, 0.34, 0.08, 2.0, 0.08)
    kit.box("wood", 0.62, 0.0, 0.34, 0.08, 2.0, 0.08)
    kit.box("wood", 0.0, 0.9, 0.3, 1.3, 0.08, 0.1)
    kit.box("wood", 0.0, -0.9, 0.3, 1.3, 0.08, 0.1)
    kit.box("wood", 0.64, 0.0, 0.47, 0.05, 1.9, 0.34, jitter=0.01)
    kit.box("wood", -0.62, 0.35, 0.47, 0.05, 0.9, 0.34, tilt_y=0.1, jitter=0.01)
    kit.box("wood", 0.0, 0.95, 0.47, 1.3, 0.05, 0.38, jitter=0.01)
    kit.beam("wood", (0.4, -0.9, 0.4), (1.0, -2.6, 1.0), 0.1, 0.08)
    kit.beam("wood", (-0.4, -0.9, 0.4), (-0.5, -1.7, 0.7), 0.1, 0.08)
    kit.beam("wood", (-0.5, -1.7, 0.7), (-0.35, -2.0, 0.5), 0.05, 0.05)
    kit.beam("iron", (-0.6, -0.4, 0.5), (0.6, -0.4, 0.5), 0.05, 0.03)
    tilted_about(kit, {"wood": before["wood"], "iron": before["iron"]}, Vector((0.0, 0.0, 0.3)), "Y", -0.22)


def bridge_broken(kit: Kit) -> None:
    for x, y in ((-1.7, -0.9), (-1.7, 0.9), (0.4, -0.9), (0.4, 0.9)):
        kit.box("wood", x, y, -0.6, 0.18, 0.18, 1.35 + kit.spread(0.08), tilt_x=kit.spread(0.03), tilt_y=kit.spread(0.03), jitter=0.01)
    for y in (-0.55, 0.55):
        kit.beam("wood", (-2.0, y, 0.12), (0.9, y, 0.12), 0.14, 0.1)
    for x in (-1.7, 0.4):
        kit.box("wood", x, 0.0, -0.05, 0.1, 1.8, 0.1)
    kit.beam("wood", (-1.7, -0.9, 0.5), (0.4, -0.9, 0.5), 0.1, 0.1)
    kit.beam("wood", (-1.7, 0.9, 0.5), (0.4, 0.9, 0.5), 0.1, 0.1)
    for index in range(14):
        if index in (5, 9):
            continue
        x = -1.9 + index * 0.2
        kit.box("wood", x, kit.spread(0.02), 0.17, 0.19, 1.65 + kit.spread(0.05), 0.08, yaw=kit.spread(0.03), jitter=0.006)
        for y in (-0.55, 0.55):
            kit.cylinder("iron", x, y, 0.25, 0.018, 0.02, segments=5)
    before = snapshot(kit)
    for index in range(14, 20):
        if index == 16:
            continue
        x = -1.9 + index * 0.2
        kit.box("wood", x, kit.spread(0.03), 0.17, 0.19, 1.6, 0.08, yaw=kit.spread(0.05), jitter=0.006)
    kit.beam("wood", (0.85, -0.55, 0.12), (1.9, -0.55, 0.12), 0.14, 0.1)
    kit.beam("wood", (0.85, 0.55, 0.12), (1.4, 0.55, 0.12), 0.14, 0.1)
    kit.beam("wood", (1.4, 0.55, 0.12), (1.6, 0.6, 0.0), 0.06, 0.05)
    kit.box("iron", 1.3, 0.0, 0.25, 0.12, 1.5, 0.012)
    tilted_about(kit, {"wood": before["wood"], "iron": before["iron"]}, Vector((0.85, 0.0, 0.17)), "Y", 0.85)
    kit.box("iron", -0.55, 0.0, 0.25, 0.12, 1.5, 0.012)
    kit.box("iron", 0.55, 0.0, 0.25, 0.12, 1.5, 0.012)


def reeds(kit: Kit) -> None:
    for index in range(28):
        angle = kit.rng.random() * math.tau
        spread = kit.rng.random() ** 0.6 * 0.2
        base = Vector((math.cos(angle) * spread, math.sin(angle) * spread, 0.0))
        out = Vector((math.cos(angle), math.sin(angle), 0.0))
        height = 1.1 + kit.rng.random() * 0.55
        bend = 0.1 + kit.rng.random() * 0.35
        knee = base + out * (bend * 0.35) + Vector((0.0, 0.0, height * 0.55))
        tip = base + out * bend + Vector((kit.spread(0.04), kit.spread(0.04), height))
        kit.rod("reed", tuple(base), tuple(knee), 0.014, segments=3, top=0.009)
        kit.rod("reed", tuple(knee), tuple(tip), 0.009, segments=3, top=0.002)
        if index % 6 == 0:
            head = tip + (tip - knee).normalized() * 0.2
            kit.rod("reed", tuple(tip), tuple(head), 0.026, segments=4, top=0.012)


def warden_stone(kit: Kit) -> None:
    kit.box("stone", 0.0, 0.0, -0.1, 0.9, 0.7, 1.15, yaw=0.12, tilt_x=0.02, jitter=0.07)
    kit.box("stone", 0.0, 0.02, 1.0, 0.74, 0.54, 0.56, yaw=0.02, tilt_y=0.02, jitter=0.05)
    kit.box("stone", 0.03, 0.04, 1.5, 0.52, 0.4, 0.34, yaw=0.1, tilt_x=-0.12, tilt_y=0.08, jitter=0.04)
    kit.box("stone", 0.0, -0.02, 0.8, 0.96, 0.76, 0.14, yaw=0.12, jitter=0.02)
    for index in range(7):
        kit.box("stone", -0.36 + index * 0.12, -0.4, 0.82, 0.05, 0.05, 0.1)
    kit.rod("iron", (0.0, -0.25, 1.5), (0.0, -0.62, 1.55), 0.025, segments=5)
    kit.rod("iron", (0.0, -0.62, 1.55), (0.0, -0.62, 1.42), 0.02, segments=5)
    kit.rod("iron", (0.0, -0.62, 1.42), (0.0, -0.62, 1.32), 0.008, segments=4)
    kit.box("iron", 0.0, -0.62, 1.04, 0.2, 0.2, 0.05)
    kit.box("iron", 0.0, -0.62, 1.09, 0.17, 0.17, 0.17)
    kit.cylinder("iron", 0.0, -0.62, 1.26, 0.13, 0.07, segments=4, top=0.03, yaw=math.pi / 4.0)
    for x, y in ((-0.075, -0.695), (0.075, -0.695), (-0.075, -0.545), (0.075, -0.545)):
        kit.rod("iron", (x, y, 1.09), (x, y, 1.26), 0.008, segments=4)


def shelter(kit: Kit) -> None:
    for x in (-1.2, 1.2):
        kit.box("wood", x, -0.7, 0.0, 0.14, 0.14, 2.25, tilt_x=kit.spread(0.02), tilt_y=kit.spread(0.03), jitter=0.01)
        kit.box("wood", x * 0.85, 1.05, 0.0, 0.14, 0.14, 0.88, jitter=0.01)
    kit.beam("wood", (-1.45, -0.7, 2.2), (1.45, -0.7, 2.25), 0.11, 0.11)
    slope = -math.atan2(1.3, 1.8)
    length = math.hypot(1.3, 1.8)
    for index in range(8):
        kit.box("wood", -1.33 + index * 0.38 + kit.spread(0.01), 0.2, 1.55 + kit.spread(0.02), 0.36, length + kit.spread(0.08), 0.05, tilt_x=slope, jitter=0.008)
    kit.beam("wood", (-1.35, 0.15, 1.46), (1.35, 0.15, 1.5), 0.07, 0.07)
    kit.sheet("cloth", (-1.45, -0.55, 2.15), (1.5, 0.0, 0.0), (0.0, 1.5, -1.08), 8, 8, 0.1, ragged=0.15)
    kit.box("plaster", -1.55, 0.2, 0.0, 0.14, 1.7, 1.95, tilt_y=0.14, jitter=0.012)
    kit.box("plaster", -1.4, -0.5, 1.3, 0.12, 0.5, 0.4, tilt_y=0.14)
    for z, w in ((0.0, 1.5), (0.45, 1.4), (0.9, 1.55), (1.35, 1.2)):
        kit.box("stone", 1.55 + kit.spread(0.03), 0.2 + kit.spread(0.12), z, 0.4, w, 0.46, yaw=kit.spread(0.05), jitter=0.025)
    kit.scatter_blocks("stone", 3, 0.6, 1.4, 0.9, 1.4, 0.15, 0.3)


def hut_patched(kit: Kit) -> None:
    for x, y in ((-1.7, -1.4), (1.7, -1.4), (-1.7, 1.4), (1.7, 1.4)):
        kit.box("wood", x, y, 0.0, 0.14, 0.14, 2.15, tilt_x=kit.spread(0.02), tilt_y=kit.spread(0.02), jitter=0.01)
    kit.courses("stone", -1.7, 1.7, 1.25, 0.4, [2.0, 1.85, 2.05, 1.9, 2.0, 1.8, 2.05], jitter=0.04)
    kit.scatter_blocks("stone", 3, -1.5, 1.5, 1.5, 1.9, 0.18, 0.3)
    kit.box("plaster", -1.72, 0.0, 0.0, 0.16, 2.7, 2.0, jitter=0.012)
    kit.box("plaster", -1.8, -0.4, 0.4, 0.06, 0.8, 0.7)
    kit.box("plaster", -1.72, 1.1, 1.7, 0.16, 0.7, 0.4, tilt_x=-0.35)
    for index in range(13):
        kit.box("wood", 1.72, -1.3 + index * 0.215, 0.0, 0.09, 0.2, 1.9 + kit.spread(0.15), yaw=kit.spread(0.03), jitter=0.006)
    kit.beam("wood", (1.78, -1.4, 0.7), (1.78, 1.4, 0.75), 0.06, 0.05)
    kit.beam("wood", (1.78, -1.4, 1.6), (1.78, 1.4, 1.55), 0.06, 0.05)
    kit.rod("wood", (0.1, -1.4, 0.0), (0.1, -1.4, 2.35), 0.05, segments=5)
    kit.rod("wood", (-1.7, -1.4, 2.3), (1.7, -1.4, 2.35), 0.04, segments=5)
    kit.sheet("cloth", (-1.7, -1.42, 2.25), (1.8, 0.0, 0.0), (0.0, 0.0, -2.1), 8, 8, 0.1, ragged=0.3)
    kit.sheet("cloth", (1.1, -1.42, 2.3), (0.6, 0.0, 0.0), (0.0, 0.0, -1.5), 3, 6, 0.08, ragged=0.4)
    for width, z in ((2.9, 2.0), (2.1, 2.22), (1.3, 2.44), (0.6, 2.66)):
        kit.box("plaster", -1.72, 0.0, z, 0.16, width, 0.24)
        kit.box("wood", 1.72, 0.0, z, 0.09, width, 0.24)
    kit.beam("wood", (-1.9, 0.0, 2.9), (1.9, 0.0, 2.9), 0.12, 0.12)
    slope = math.atan2(0.9, 1.7)
    length = math.hypot(0.9, 1.7)
    for index in range(9):
        kit.box("wood", -1.76 + index * 0.44 + kit.spread(0.01), -0.85, 2.42 + kit.spread(0.02), 0.42, length + 0.15, 0.06, tilt_x=slope, jitter=0.008)
    for z, y in ((2.35, -1.5), (2.65, -0.8)):
        kit.beam("wood", (-1.85, y, z), (1.85, y, z), 0.07, 0.07)
    kit.sheet("cloth", (-1.95, 0.0, 2.92), (3.9, 0.0, 0.0), (0.0, 1.8, -0.95), 10, 7, 0.1, ragged=0.1)


def still_figure(kit: Kit) -> None:
    scale: float = standing_scale()
    cloth, skin = figure(False)
    fitted(cloth, skin, scale)
    kit.parts["cloth"] = cloth
    kit.parts["skin"] = skin


def still_figure_bowed(kit: Kit) -> None:
    scale: float = standing_scale()
    cloth, skin = figure(True)
    fitted(cloth, skin, scale)
    kit.parts["cloth"] = cloth
    kit.parts["skin"] = skin


MODELS: dict[str, Callable[[Kit], None]] = {
    "standing_clock": standing_clock,
    "standing_clock_tilted": standing_clock_tilted,
    "great_doors": great_doors,
    "wide_stair": wide_stair,
    "sunken_cart": sunken_cart,
    "bridge_broken": bridge_broken,
    "reeds": reeds,
    "warden_stone": warden_stone,
    "shelter": shelter,
    "hut_patched": hut_patched,
    "still_figure": still_figure,
    "still_figure_bowed": still_figure_bowed,
}


def main() -> None:
    arguments: list[str] = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(arguments) < 1:
        raise SystemExit("usage: blender -b --python blender/build_road.py -- <output dir> [only=<id>,<id>]")
    target: str = arguments[0]
    only: set[str] = set()
    for argument in arguments[1:]:
        if argument.startswith("only="):
            only.update(argument[5:].split(","))
    os.makedirs(target, exist_ok=True)
    for index, (name, build) in enumerate(MODELS.items()):
        if only and name not in only:
            continue
        kit: Kit = Kit(5000 + index)
        build(kit)
        triangles: int = export(kit, os.path.join(target, f"{name}.glb"))
        print(f"built {name}: {triangles} triangles")


main()
