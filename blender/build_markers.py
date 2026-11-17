import math
import os
import sys
from typing import Callable

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import bmesh
import bpy
from bmesh.types import BMesh, BMVert
from bpy.types import Object
from mathutils import Vector

import environment_kit
from environment_kit import Kit, clear_scene, material, sharpen, unwrap

FRONT: float = -1.0
INLAY: float = 0.012

environment_kit.PALETTE["glyph"] = ((0.07, 0.075, 0.08), 0.0, 0.8, False)
environment_kit.PALETTE["crystal"] = ((0.2, 0.24, 0.27), 0.05, 0.3, False)
environment_kit.PALETTE["veil"] = ((0.0, 0.0, 0.0), 0.0, 0.99, False)


class Node:
    def __init__(self, name: str, kit: Kit, at: tuple[float, float, float] = (0.0, 0.0, 0.0), parent: str | None = None) -> None:
        self.name: str = name
        self.kit: Kit = kit
        self.at: tuple[float, float, float] = at
        self.parent: str | None = parent


def wedge(kit: Kit, name: str, cz: float, inner: float, outer: float, a0: float, a1: float, y0: float, y1: float) -> None:
    target: BMesh = kit.mesh(name)
    ring: list[tuple[float, float]] = [(math.cos(a0) * inner, math.sin(a0) * inner), (math.cos(a0) * outer, math.sin(a0) * outer), (math.cos(a1) * outer, math.sin(a1) * outer), (math.cos(a1) * inner, math.sin(a1) * inner)]
    front: list[BMVert] = [target.verts.new((x, y0, cz + z)) for x, z in ring]
    back: list[BMVert] = [target.verts.new((x, y1, cz + z)) for x, z in ring]
    target.faces.new(front[::-1])
    target.faces.new(back)
    for index in range(4):
        following: int = (index + 1) % 4
        target.faces.new((front[index], front[following], back[following], back[index]))


def bipyramid(kit: Kit, name: str, sides: int, top: float, crown: float, crown_radius: float, girdle_radius: float, bottom: float) -> None:
    target: BMesh = kit.mesh(name)
    apex: BMVert = target.verts.new((0.0, 0.0, top))
    foot: BMVert = target.verts.new((0.0, 0.0, -bottom))
    upper: list[BMVert] = [target.verts.new((math.cos((index + 0.5) * math.tau / sides) * crown_radius, math.sin((index + 0.5) * math.tau / sides) * crown_radius, crown)) for index in range(sides)]
    girdle: list[BMVert] = [target.verts.new((math.cos(index * math.tau / sides) * girdle_radius, math.sin(index * math.tau / sides) * girdle_radius, 0.0)) for index in range(sides)]
    for index in range(sides):
        following: int = (index + 1) % sides
        target.faces.new((upper[index], upper[following], apex))
        target.faces.new((girdle[index], girdle[following], upper[index]))
        target.faces.new((upper[index], girdle[following], upper[following]))
        target.faces.new((girdle[following], girdle[index], foot))


def quad(kit: Kit, name: str, corners: list[tuple[float, float, float]], uvs: list[tuple[float, float]]) -> None:
    target: BMesh = kit.mesh(name)
    layer = target.loops.layers.uv.verify()
    face = target.faces.new([target.verts.new(corner) for corner in corners])
    for loop, uv in zip(face.loops, uvs):
        loop[layer].uv = uv


def chevron(kit: Kit, x: float, y: float, z: float, size: float, pointing: float) -> None:
    low: float = z if pointing > 0.0 else z + size * 0.6
    high: float = z + size * 0.6 if pointing > 0.0 else z
    for side in (-1.0, 1.0):
        kit.beam("glyph", (x + side * size * 0.5, y, low), (x, y, high), 0.07, 0.05)


def waypoint() -> list[Node]:
    base: Kit = Kit(41)
    base.cylinder("stone", 0.0, 0.0, 0.0, 1.62, 0.2, segments=8, yaw=math.pi / 8.0)
    base.cylinder("stone", 0.0, 0.0, 0.2, 1.3, 0.18, segments=8, top=1.25, yaw=math.pi / 8.0)
    for index in range(4):
        angle: float = math.pi / 4.0 + index * math.pi / 2.0
        x: float = math.cos(angle) * 1.4
        y: float = math.sin(angle) * 1.4
        base.cylinder("stone", x, y, 0.2, 0.17, 0.62, segments=4, top=0.11, yaw=angle + math.pi / 4.0)
        base.cylinder("glyph", x, y, 0.82, 0.1, 0.05, segments=4, top=0.0, yaw=angle + math.pi / 4.0)
    base.cylinder("stone", 0.0, 0.0, 0.38, 0.46, 0.24, segments=8, top=0.36, yaw=math.pi / 8.0)
    base.cylinder("stone", 0.0, 0.0, 0.62, 0.3, 0.1, segments=8, top=0.36, yaw=math.pi / 8.0)
    for index in range(4):
        angle = index * math.pi / 2.0
        base.rod("stone", (math.cos(angle) * 0.28, math.sin(angle) * 0.28, 0.66), (math.cos(angle) * 0.4, math.sin(angle) * 0.4, 1.0), 0.055, segments=4, top=0.02)
    for index in range(8):
        angle = index * math.pi / 4.0 + math.pi / 8.0
        base.box("glyph", math.cos(angle) * 0.86, math.sin(angle) * 0.86, 0.38 - INLAY, 0.07, 0.34, INLAY * 2.0, yaw=angle + math.pi / 2.0)
        between: float = angle + math.pi / 8.0
        base.cylinder("glyph", math.cos(between) * 1.1, math.sin(between) * 1.1, 0.38 - INLAY, 0.05, INLAY * 2.0, segments=6)
    for index in range(8):
        angle = index * math.pi / 4.0
        base.box("glyph", math.cos(angle) * 0.42, math.sin(angle) * 0.42, 0.43, 0.06, 0.03, 0.14, yaw=angle + math.pi / 2.0)
    focal: Kit = Kit(42)
    bipyramid(focal, "crystal", 8, 0.62, 0.17, 0.2, 0.28, 0.46)
    return [Node("dais", base), Node("focal", focal, (0.0, 0.0, 1.14))]


ARCH_HALF: float = 1.05
ARCH_SPRING: float = 2.35
ARCH_RING: float = 0.6
ARCH_DEPTH: float = 0.8
ARCH_PLINTH: float = 0.42
ARCH_STONES: int = 9


def way_up() -> list[Node]:
    frame: Kit = Kit(51)
    frame.box("stone", 0.0, 0.0, 0.0, 3.5, 1.2, ARCH_PLINTH, jitter=0.01)
    for index, (depth, height) in enumerate(((0.36, 0.28), (0.36, 0.14))):
        frame.box("stone", 0.0, FRONT * (0.6 + 0.18 + index * 0.36), 0.0, 2.6 - index * 0.2, depth, height, jitter=0.01)
    pier: float = ARCH_HALF + 0.31
    for side in (-1.0, 1.0):
        frame.box("stone", side * pier, 0.0, ARCH_PLINTH, 0.8, 0.98, 0.28)
        frame.box("stone", side * pier, 0.0, ARCH_PLINTH + 0.28, 0.62, ARCH_DEPTH, ARCH_SPRING - ARCH_PLINTH - 0.46, jitter=0.008)
        frame.box("stone", side * pier, 0.0, ARCH_SPRING - 0.18, 0.84, 0.98, 0.18)
        face: float = FRONT * (ARCH_DEPTH / 2.0) - INLAY
        frame.box("glyph", side * pier, face, ARCH_PLINTH + 0.5, 0.07, INLAY * 2.0, 1.05)
        for z in (ARCH_PLINTH + 0.62, ARCH_PLINTH + 0.95, ARCH_PLINTH + 1.28):
            frame.box("glyph", side * pier, face, z, 0.3, INLAY * 2.0, 0.06)
    gap: float = 0.012
    for index in range(ARCH_STONES):
        a0: float = math.pi * index / ARCH_STONES + gap
        a1: float = math.pi * (index + 1) / ARCH_STONES - gap
        key: bool = index == ARCH_STONES // 2
        wedge(frame, "stone", ARCH_SPRING, ARCH_HALF, ARCH_HALF + ARCH_RING + (0.14 if key else 0.0), a0, a1, FRONT * (ARCH_DEPTH / 2.0 + (0.06 if key else 0.0)), ARCH_DEPTH / 2.0 + (0.06 if key else 0.0))
    chevron(frame, 0.0, FRONT * (ARCH_DEPTH / 2.0 + 0.06) - INLAY, ARCH_SPRING + ARCH_HALF + 0.2, 0.34, 1.0)
    top: float = ARCH_SPRING + ARCH_HALF
    veil: Kit = Kit(52)
    quad(veil, "veil", [(-ARCH_HALF, 0.0, ARCH_PLINTH), (ARCH_HALF, 0.0, ARCH_PLINTH), (ARCH_HALF, 0.0, top), (-ARCH_HALF, 0.0, top)], [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)])
    seal: Kit = Kit(53)
    seal.box("stone", 0.0, 0.0, ARCH_PLINTH, ARCH_HALF * 2.0 - 0.04, 0.24, ARCH_SPRING - ARCH_PLINTH, jitter=0.006)
    seal.cylinder("stone", 0.0, 0.12, ARCH_SPRING, ARCH_HALF - 0.02, 0.24, segments=18, tilt_x=math.pi / 2.0)
    seal.box("glyph", 0.0, FRONT * 0.12 - INLAY, ARCH_PLINTH + 1.1, 1.3, INLAY * 2.0, 0.08)
    seal.box("glyph", 0.0, FRONT * 0.12 - INLAY, ARCH_PLINTH + 0.5, 0.08, INLAY * 2.0, 1.4)
    return [Node("frame", frame), Node("veil", veil), Node("seal", seal)]


WELL_HALF: float = 1.0
WELL_FRONT: float = FRONT * 1.3
WELL_BACK: float = 1.0
WELL_RIM: float = 0.46
WELL_COPING: float = 0.1
WELL_CORNER: float = 0.82


def way_down() -> list[Node]:
    frame: Kit = Kit(61)
    length: float = WELL_BACK - WELL_FRONT
    middle: float = (WELL_FRONT + WELL_BACK) / 2.0
    top: float = WELL_RIM + WELL_COPING
    for side in (-1.0, 1.0):
        frame.box("stone", side * (WELL_HALF + 0.28), middle, 0.0, 0.5, length, WELL_RIM, jitter=0.01)
        frame.box("stone", side * (WELL_HALF + 0.28), middle, WELL_RIM, 0.62, length + 0.08, WELL_COPING)
        frame.box("glyph", side * (WELL_HALF + 0.28), middle, top - INLAY, 0.08, length * 0.62, INLAY * 2.0)
        for end in (WELL_FRONT - 0.2, WELL_BACK + 0.32):
            frame.box("stone", side * (WELL_HALF + 0.32), end, 0.0, 0.72, 0.72, WELL_CORNER, jitter=0.01)
            frame.box("stone", side * (WELL_HALF + 0.32), end, WELL_CORNER, 0.58, 0.58, 0.12)
            frame.box("glyph", side * (WELL_HALF + 0.32), end, WELL_CORNER + 0.12 - INLAY, 0.3, 0.3, INLAY * 2.0)
    frame.box("stone", 0.0, WELL_BACK + 0.32, 0.0, WELL_HALF * 2.0 + 0.1, 0.5, WELL_RIM, jitter=0.01)
    frame.box("stone", 0.0, WELL_BACK + 0.32, WELL_RIM, WELL_HALF * 2.0 + 0.2, 0.66, WELL_COPING)
    frame.box("stone", 0.0, WELL_FRONT - 0.12, 0.0, WELL_HALF * 2.0 + 0.4, 0.26, 0.1)
    for side in (-1.0, 1.0):
        frame.beam("glyph", (side * 0.32, WELL_BACK + 0.12, top - INLAY), (0.0, WELL_BACK + 0.5, top - INLAY), 0.07, INLAY * 2.0)
    veil: Kit = Kit(62)
    wall: float = WELL_BACK + 0.07 - 0.01
    quad(veil, "veil", [(-WELL_HALF, WELL_FRONT, 0.02), (WELL_HALF, WELL_FRONT, 0.02), (WELL_HALF, wall, 0.02), (-WELL_HALF, wall, 0.02)], [(0.0, 0.0), (1.0, 0.0), (1.0, 0.5), (0.0, 0.5)])
    quad(veil, "veil", [(-WELL_HALF, wall, 0.02), (WELL_HALF, wall, 0.02), (WELL_HALF, wall, WELL_RIM), (-WELL_HALF, wall, WELL_RIM)], [(0.0, 0.5), (1.0, 0.5), (1.0, 1.0), (0.0, 1.0)])
    seal: Kit = Kit(63)
    seal.box("stone", 0.0, (WELL_FRONT + wall) / 2.0, 0.0, WELL_HALF * 2.0 - 0.04, wall - WELL_FRONT - 0.04, 0.18, jitter=0.006)
    seal.box("glyph", 0.0, (WELL_FRONT + wall) / 2.0, 0.18 - INLAY, 1.3, 0.08, INLAY * 2.0)
    seal.box("glyph", 0.0, (WELL_FRONT + wall) / 2.0, 0.18 - INLAY, 0.08, 1.6, INLAY * 2.0)
    return [Node("frame", frame), Node("veil", veil), Node("seal", seal)]


def checkpoint() -> list[Node]:
    stone: Kit = Kit(71)
    back: float = 1.9
    stone.box("stone", 0.0, back, 0.0, 0.86, 0.6, 0.22, jitter=0.01)
    stone.cylinder("stone", 0.0, back, 0.22, 0.34, 1.12, segments=4, top=0.25, yaw=math.pi / 4.0)
    stone.cylinder("stone", 0.0, back, 1.34, 0.27, 0.26, segments=4, top=0.0, yaw=math.pi / 4.0)
    face: float = back + FRONT * 0.215 - INLAY
    stone.box("glyph", 0.0, face, 0.36, 0.06, INLAY * 2.0, 0.62, tilt_x=-0.06)
    stone.box("glyph", 0.0, face - 0.012, 1.08, 0.13, INLAY * 2.0, 0.13, tilt_y=math.pi / 4.0)
    return [Node("stele", stone)]


MODELS: dict[str, Callable[[], list[Node]]] = {
    "waypoint": waypoint,
    "way_up": way_up,
    "way_down": way_down,
    "checkpoint_stone": checkpoint,
}


def node_object(node: Node) -> tuple[Object, int]:
    mesh = bpy.data.meshes.new(node.name)
    combined: BMesh = bmesh.new()
    triangles: int = 0
    for index, (name, made) in enumerate(node.kit.parts.items()):
        if len(made.faces) == 0:
            made.free()
            continue
        if name != "veil":
            bmesh.ops.recalc_face_normals(made, faces=made.faces[:])
        made.normal_update()
        if name != "veil":
            unwrap(made)
        sharpen(made)
        bmesh.ops.triangulate(made, faces=made.faces[:])
        triangles += len(made.faces)
        for face in made.faces:
            face.material_index = len(mesh.materials)
        part = bpy.data.meshes.new(f"{node.name}_{name}")
        made.to_mesh(part)
        made.free()
        combined.from_mesh(part)
        bpy.data.meshes.remove(part)
        mesh.materials.append(material(name))
    combined.to_mesh(mesh)
    combined.free()
    obj: Object = bpy.data.objects.new(node.name, mesh)
    obj.location = Vector(node.at)
    bpy.context.scene.collection.objects.link(obj)
    return obj, triangles


def export_nodes(nodes: list[Node], path: str) -> int:
    clear_scene()
    triangles: int = 0
    made: dict[str, Object] = {}
    for node in nodes:
        obj, count = node_object(node)
        made[node.name] = obj
        triangles += count
    for node in nodes:
        if node.parent is not None:
            made[node.name].parent = made[node.parent]
    for obj in made.values():
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=True, export_animations=False, export_cameras=False, export_lights=False)
    return triangles


def main() -> None:
    arguments: list[str] = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(arguments) < 1:
        raise SystemExit("usage: blender -b --factory-startup --python blender/build_markers.py -- <output dir>")
    target: str = arguments[0]
    os.makedirs(target, exist_ok=True)
    for name, build in MODELS.items():
        triangles: int = export_nodes(build(), os.path.join(target, f"{name}.glb"))
        print(f"built {name}: {triangles} triangles")


main()
