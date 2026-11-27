import math
import sys
from dataclasses import dataclass, field
from typing import Callable

import bmesh
import bpy
from bpy.types import Material, Object
from mathutils import Matrix, Quaternion, Vector

Color = tuple[float, float, float]
Point = tuple[float, float, float]
Pose = dict[str, tuple[Vector, Quaternion]]

FPS: int = 30
X: Vector = Vector((1.0, 0.0, 0.0))
Y: Vector = Vector((0.0, 1.0, 0.0))
Z: Vector = Vector((0.0, 0.0, 1.0))
NONE: Matrix = Matrix.Identity(4)

WOOD: Color = (0.085, 0.042, 0.022)
WOOD_DEEP: Color = (0.026, 0.014, 0.009)
BRASS: Color = (0.52, 0.34, 0.09)
FACE: Color = (0.78, 0.74, 0.62)
INK: Color = (0.03, 0.025, 0.02)
STONE: Color = (0.3, 0.29, 0.27)
STONE_DARK: Color = (0.17, 0.165, 0.155)
LEATHER: Color = (0.2, 0.055, 0.04)
PAGE: Color = (0.74, 0.67, 0.52)

CLOCK: dict[str, float] = {
    "foot_depth": 0.5,
    "pivot_z": 1.72,
    "bob_z": 0.94,
    "face_z": 2.08,
    "face_y": -0.262,
    "door_x": -0.255,
    "door_y": -0.205,
    "swing_seconds": 1.6,
    "swing_degrees": 9.0,
    "tick_degrees": 6.0,
}
LEDGER: dict[str, float] = {
    "top_z": 1.0,
    "tilt_degrees": 16.0,
    "cover": 0.012,
    "block": 0.03,
    "leaf_width": 0.27,
    "leaf_length": 0.38,
    "idle_seconds": 2.4,
}


def material(name: str, color: Color, roughness: float) -> Material:
    made: Material = bpy.data.materials.new(name)
    made.use_nodes = True
    shader = next(node for node in made.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
    shader.inputs["Metallic"].default_value = 0.0
    shader.inputs["Roughness"].default_value = roughness
    return made


@dataclass
class Body:
    materials: list[Material]
    verts: list[Vector] = field(default_factory=list)
    bones: list[str] = field(default_factory=list)
    faces: list[tuple[int, ...]] = field(default_factory=list)
    face_materials: list[int] = field(default_factory=list)

    def take(self, mesh: bmesh.types.BMesh, made: Material, bone: str, place: Matrix) -> None:
        start: int = len(self.verts)
        index: int = self.materials.index(made)
        for vert in mesh.verts:
            self.verts.append(place @ vert.co)
            self.bones.append(bone)
        mesh.verts.index_update()
        for face in mesh.faces:
            self.faces.append(tuple(start + vert.index for vert in face.verts))
            self.face_materials.append(index)
        mesh.free()

    def box(self, center: Point, size: Point, made: Material, bone: str, place: Matrix = NONE, bevel: float = 0.0) -> None:
        mesh = bmesh.new()
        bmesh.ops.create_cube(mesh, size=1.0)
        bmesh.ops.scale(mesh, vec=Vector(size), verts=mesh.verts)
        if bevel > 0.0:
            bmesh.ops.bevel(mesh, geom=list(mesh.edges), offset=bevel, segments=1, affect="EDGES", profile=0.5)
        bmesh.ops.translate(mesh, vec=Vector(center), verts=mesh.verts)
        self.take(mesh, made, bone, place)

    def disc(self, center: Point, radius: float, top_radius: float, depth: float, axis: Vector, made: Material, bone: str, segments: int = 12, place: Matrix = NONE) -> None:
        mesh = bmesh.new()
        bmesh.ops.create_cone(mesh, cap_ends=True, cap_tris=False, segments=segments, radius1=radius, radius2=top_radius, depth=depth)
        turn: Matrix = Z.rotation_difference(axis).to_matrix().to_4x4()
        bmesh.ops.transform(mesh, matrix=Matrix.Translation(Vector(center)) @ turn, verts=mesh.verts)
        self.take(mesh, made, bone, place)

    def ball(self, center: Point, radius: float, made: Material, bone: str) -> None:
        mesh = bmesh.new()
        bmesh.ops.create_icosphere(mesh, subdivisions=1, radius=radius)
        bmesh.ops.translate(mesh, vec=Vector(center), verts=mesh.verts)
        self.take(mesh, made, bone, NONE)

    def build(self, name: str, armature: Object) -> Object:
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([tuple(vert) for vert in self.verts], [], self.faces)
        for made in self.materials:
            mesh.materials.append(made)
        for polygon, index in zip(mesh.polygons, self.face_materials):
            polygon.material_index = index
            polygon.use_smooth = False
        mesh.update()
        obj: Object = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        for bone in sorted(set(self.bones)):
            group = obj.vertex_groups.new(name=bone)
            group.add([index for index, owner in enumerate(self.bones) if owner == bone], 1.0, "REPLACE")
        obj.parent = armature
        modifier = obj.modifiers.new("Armature", "ARMATURE")
        modifier.object = armature
        return obj


def skeleton(name: str, bones: list[tuple[str, str | None, Point, Point]]) -> Object:
    data = bpy.data.armatures.new(name)
    armature: Object = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="EDIT")
    for bone_name, parent, head, tail in bones:
        bone = data.edit_bones.new(bone_name)
        bone.head = head
        bone.tail = tail
        bone.roll = 0.0
        if parent is not None:
            bone.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    return armature


def rest_turn(armature: Object, bone: str) -> Quaternion:
    return armature.data.bones[bone].matrix_local.to_quaternion()


def turn(armature: Object, bone: str, axis: Vector, degrees: float) -> Quaternion:
    local: Vector = rest_turn(armature, bone).inverted() @ axis
    return Quaternion(local.normalized(), math.radians(degrees))


def move(armature: Object, bone: str, delta: Vector) -> Vector:
    return rest_turn(armature, bone).inverted() @ delta


def world_turn(armature: Object, bone: str, rotation: Quaternion) -> Quaternion:
    rest: Quaternion = rest_turn(armature, bone)
    return rest.inverted() @ rotation @ rest


def clip(armature: Object, name: str, seconds: float, pose_at: Callable[[float], Pose]) -> None:
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    armature.animation_data_create()
    armature.animation_data.action = action
    frames: int = round(seconds * FPS)
    for frame in range(frames + 1):
        pose: Pose = pose_at(frame / FPS)
        for bone_name, (location, rotation) in pose.items():
            bone = armature.pose.bones[bone_name]
            bone.rotation_mode = "QUATERNION"
            bone.location = location
            bone.rotation_quaternion = rotation
            bone.keyframe_insert("location", frame=frame)
            bone.keyframe_insert("rotation_quaternion", frame=frame)
    for curve in action_curves(action):
        for point in curve.keyframe_points:
            point.interpolation = "LINEAR"
    track = armature.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, action)
    armature.animation_data.action = None


def action_curves(action: bpy.types.Action) -> list[bpy.types.FCurve]:
    if hasattr(action, "layers") and len(action.layers) > 0:
        return [curve for layer in action.layers for strip in layer.strips for bag in strip.channelbags for curve in bag.fcurves]
    return list(action.fcurves)


def still() -> tuple[Vector, Quaternion]:
    return (Vector((0.0, 0.0, 0.0)), Quaternion())


def ramp(value: float, start: float, end: float) -> float:
    return min(1.0, max(0.0, (value - start) / (end - start)))


def smooth(value: float) -> float:
    return value * value * (3.0 - 2.0 * value)


def shudder(time: float, amplitude: float, rate: float, decay: float, phase: float = 0.0) -> float:
    return amplitude * math.exp(-time * decay) * math.sin(2.0 * math.pi * rate * time + phase)


def clock_body(armature: Object) -> Body:
    wood: Material = material("wood", WOOD, 0.62)
    deep: Material = material("wood_deep", WOOD_DEEP, 0.8)
    brass: Material = material("brass", BRASS, 0.45)
    face: Material = material("face", FACE, 0.7)
    ink: Material = material("ink", INK, 0.6)
    body = Body([wood, deep, brass, face, ink])
    body.box((0.0, 0.0, 0.06), (0.78, CLOCK["foot_depth"], 0.12), wood, "case", bevel=0.015)
    body.box((0.0, 0.0, 0.37), (0.7, 0.44, 0.5), wood, "case", bevel=0.012)
    body.box((0.0, -0.222, 0.37), (0.5, 0.01, 0.32), deep, "case")
    body.box((0.0, 0.0, 0.635), (0.72, 0.46, 0.03), brass, "case")
    body.box((0.0, 0.165, 1.21), (0.56, 0.05, 1.12), wood, "case")
    body.box((0.0, 0.13, 1.21), (0.48, 0.02, 1.1), deep, "case")
    for side in (-1.0, 1.0):
        body.box((side * 0.255, -0.01, 1.21), (0.05, 0.34, 1.12), wood, "case")
        body.disc((side * 0.16, 0.06, 1.3), 0.035, 0.035, 0.22, Z, brass, "case", segments=8)
        body.box((side * 0.16, 0.06, 1.55), (0.004, 0.004, 0.28), brass, "case")
    body.box((0.0, 0.0, 1.785), (0.66, 0.44, 0.03), brass, "case")
    body.box((0.0, -0.21, 0.69), (0.5, 0.02, 0.04), wood, "door")
    body.box((0.0, -0.21, 1.73), (0.5, 0.02, 0.04), wood, "door")
    for side in (-1.0, 1.0):
        body.box((side * 0.23, -0.21, 1.21), (0.04, 0.02, 1.0), wood, "door")
    body.box((0.0, -0.214, 1.21), (0.008, 0.008, 1.0), brass, "door")
    body.box((0.0, -0.214, 1.21), (0.44, 0.008, 0.008), brass, "door")
    body.box((0.0, 0.0, 2.1), (0.72, 0.48, 0.6), wood, "hood", bevel=0.015)
    body.box((0.0, 0.0, 2.43), (0.8, 0.54, 0.06), wood, "hood", bevel=0.01)
    body.box((0.0, 0.0, 2.5), (0.58, 0.4, 0.08), wood, "hood", bevel=0.01)
    body.box((0.0, -0.246, 2.43), (0.8, 0.008, 0.02), brass, "hood")
    body.disc((0.0, 0.0, 2.59), 0.04, 0.03, 0.1, Z, brass, "hood", segments=8)
    body.ball((0.0, 0.0, 2.66), 0.05, brass, "hood")
    body.disc((0.0, -0.244, CLOCK["face_z"]), 0.27, 0.27, 0.016, Y, brass, "hood", segments=20)
    body.disc((0.0, -0.254, CLOCK["face_z"]), 0.235, 0.235, 0.012, Y, face, "hood", segments=20)
    for mark in range(12):
        angle: float = mark * math.pi / 6.0
        reach: float = 0.2
        size: float = 0.045 if mark % 3 == 0 else 0.025
        place: Matrix = Matrix.Translation((reach * math.sin(angle), -0.262, CLOCK["face_z"] + reach * math.cos(angle))) @ Matrix.Rotation(-angle, 4, "Y")
        body.box((0.0, 0.0, 0.0), (0.012, 0.006, size), ink, "hood", place=place)
    body.box((0.0, CLOCK["face_y"] - 0.004, CLOCK["face_z"] + 0.07), (0.016, 0.006, 0.19), ink, "hand")
    body.box((0.0, CLOCK["face_y"] - 0.004, CLOCK["face_z"] - 0.025), (0.01, 0.006, 0.05), ink, "hand")
    body.disc((0.0, CLOCK["face_y"] - 0.01, CLOCK["face_z"]), 0.018, 0.018, 0.012, Y, brass, "hand", segments=8)
    body.box((0.0, 0.03, (CLOCK["pivot_z"] + CLOCK["bob_z"]) / 2.0), (0.018, 0.01, CLOCK["pivot_z"] - CLOCK["bob_z"]), brass, "pendulum")
    body.disc((0.0, 0.03, CLOCK["bob_z"]), 0.1, 0.1, 0.026, Y, brass, "pendulum", segments=16)
    body.build("standing_clock", armature)
    return body


def clock_rig() -> Object:
    return skeleton(
        "standing_clock_rig",
        [
            ("root", None, (0.0, 0.0, 0.0), (0.0, 0.0, 0.4)),
            ("case", "root", (0.0, CLOCK["foot_depth"] / 2.0, 0.0), (0.0, CLOCK["foot_depth"] / 2.0, 0.5)),
            ("door", "case", (CLOCK["door_x"], CLOCK["door_y"], 0.7), (CLOCK["door_x"], CLOCK["door_y"], 1.1)),
            ("pendulum", "case", (0.0, 0.03, CLOCK["pivot_z"]), (0.0, 0.03, CLOCK["pivot_z"] - 0.4)),
            ("hood", "case", (0.0, 0.0, 1.8), (0.0, 0.0, 2.1)),
            ("hand", "hood", (0.0, CLOCK["face_y"], CLOCK["face_z"]), (0.0, CLOCK["face_y"] - 0.2, CLOCK["face_z"])),
        ],
    )


def tick(time: float) -> float:
    half: float = CLOCK["swing_seconds"] / 2.0
    since: float = (time - half / 2.0) % half
    rise: float = 2.0 / FPS
    if since < rise:
        return CLOCK["tick_degrees"] * since / rise
    return CLOCK["tick_degrees"] * math.exp(-(since - rise) * 7.0)


def clock_idle(armature: Object) -> Callable[[float], Pose]:
    def pose(time: float) -> Pose:
        swing: float = CLOCK["swing_degrees"] * math.sin(2.0 * math.pi * time / CLOCK["swing_seconds"])
        return {
            "root": still(),
            "case": still(),
            "door": still(),
            "hood": still(),
            "pendulum": (Vector(), turn(armature, "pendulum", Y, swing)),
            "hand": (Vector(), turn(armature, "hand", Y, tick(time))),
        }

    return pose


def clock_hit(armature: Object) -> Callable[[float], Pose]:
    def pose(time: float) -> Pose:
        lean: float = shudder(time, 2.4, 7.0, 9.0)
        twist: float = shudder(time, 1.6, 9.0, 10.0, 1.1)
        slide: float = shudder(time, 0.018, 11.0, 12.0)
        case: Quaternion = turn(armature, "case", X, -lean) @ turn(armature, "case", Z, twist)
        return {
            "root": still(),
            "case": (move(armature, "case", X * slide), case),
            "door": (Vector(), turn(armature, "door", Z, -shudder(time, 6.0, 8.0, 9.0, 0.5))),
            "hood": (Vector(), turn(armature, "hood", Y, shudder(time, 1.5, 10.0, 11.0, 0.4))),
            "pendulum": (Vector(), turn(armature, "pendulum", Y, shudder(time, 7.0, 3.0, 6.0, 0.8))),
            "hand": (Vector(), turn(armature, "hand", Y, shudder(time, 10.0, 6.0, 8.0))),
        }

    return pose


def topple(time: float) -> float:
    fall: float = ramp(time, 0.35, 1.15)
    angle: float = -90.0 * fall * fall
    if time > 1.15:
        angle += 7.0 * math.exp(-(time - 1.15) * 7.0) * abs(math.sin(math.pi * (time - 1.15) / 0.22))
    return angle


def clock_death(armature: Object) -> Callable[[float], Pose]:
    def pose(time: float) -> Pose:
        lean: float = shudder(time, 3.5, 9.0, 7.0) * (1.0 - ramp(time, 0.3, 0.45))
        case: Quaternion = turn(armature, "case", X, topple(time) - lean) @ turn(armature, "case", Z, shudder(time, 2.5, 8.0, 7.0, 0.9))
        crack: float = smooth(ramp(time, 0.15, 0.4))
        knock: float = smooth(ramp(time, 1.15, 1.35))
        hood: Quaternion = turn(armature, "hood", Y, 9.0 * crack + 6.0 * knock) @ turn(armature, "hood", X, -7.0 * crack - 4.0 * knock)
        hood_move: Vector = move(armature, "hood", Z * (0.04 * crack + 0.11 * knock) + X * (0.05 * knock))
        door: float = -112.0 * smooth(ramp(time, 0.25, 0.9)) + 10.0 * knock
        spin: float = 210.0 * (1.0 - math.exp(-ramp(time, 0.2, 2.0) * 5.0))
        swing: float = shudder(time, 10.0, 1.4, 2.6, 0.3)
        return {
            "root": still(),
            "case": (Vector(), case),
            "door": (Vector(), turn(armature, "door", Z, door)),
            "hood": (hood_move, hood),
            "pendulum": (Vector(), turn(armature, "pendulum", Y, swing)),
            "hand": (Vector(), turn(armature, "hand", Y, spin)),
        }

    return pose


def book_place() -> Matrix:
    return Matrix.Translation((0.0, 0.0, LEDGER["top_z"])) @ Matrix.Rotation(math.radians(LEDGER["tilt_degrees"]), 4, "X")


def ledger_rig() -> Object:
    place: Matrix = book_place()
    hinge: float = LEDGER["block"]

    def at(point: Point) -> Point:
        moved: Vector = place @ Vector(point)
        return (moved.x, moved.y, moved.z)

    return skeleton(
        "ledger_plinth_rig",
        [
            ("root", None, (0.0, 0.0, 0.0), (0.0, 0.0, 0.4)),
            ("plinth", "root", (0.0, 0.0, 0.0), (0.0, 0.0, 0.6)),
            ("lectern", "plinth", (0.0, 0.0, 0.9), (0.0, 0.0, 1.0)),
            ("book", "root", at((0.0, 0.0, 0.0)), at((0.0, 0.2, 0.0))),
            ("leaf", "book", at((0.0, 0.0, hinge)), at((0.0, 0.2, hinge))),
            ("page", "book", at((0.0, 0.0, hinge + 0.001)), at((0.0, 0.2, hinge + 0.001))),
        ],
    )


def page_block(body: Body, side: float, made: Material, bone: str, place: Matrix) -> None:
    width: float = LEDGER["leaf_width"]
    length: float = LEDGER["leaf_length"]
    block: float = LEDGER["block"]
    mesh = bmesh.new()
    bmesh.ops.create_cube(mesh, size=1.0)
    bmesh.ops.scale(mesh, vec=Vector((width - 0.012, length - 0.02, block)), verts=mesh.verts)
    bmesh.ops.translate(mesh, vec=Vector((side * width / 2.0, 0.0, block / 2.0)), verts=mesh.verts)
    for vert in mesh.verts:
        if vert.co.z > block * 0.75 and abs(vert.co.x) < width * 0.3:
            vert.co.z -= 0.008
    body.take(mesh, made, bone, place)


def ledger_body(armature: Object) -> Body:
    stone: Material = material("stone", STONE, 0.92)
    dark: Material = material("stone_dark", STONE_DARK, 0.95)
    leather: Material = material("leather", LEATHER, 0.75)
    page: Material = material("page", PAGE, 0.85)
    brass: Material = material("brass", BRASS, 0.5)
    ink: Material = material("ink", INK, 0.6)
    body = Body([stone, dark, leather, page, brass, ink])
    body.box((0.0, 0.0, 0.06), (0.72, 0.72, 0.12), dark, "plinth", bevel=0.02)
    body.box((0.0, 0.0, 0.16), (0.58, 0.58, 0.08), stone, "plinth", bevel=0.015)
    body.disc((0.0, 0.0, 0.5), 0.21, 0.17, 0.62, Z, stone, "plinth", segments=8)
    body.disc((0.0, 0.0, 0.8), 0.2, 0.2, 0.04, Z, dark, "plinth", segments=8)
    body.box((0.0, 0.0, 0.86), (0.56, 0.46, 0.08), stone, "plinth", bevel=0.015)
    lectern: Matrix = Matrix.Translation((0.0, 0.0, LEDGER["top_z"])) @ Matrix.Rotation(math.radians(LEDGER["tilt_degrees"]), 4, "X")
    body.box((0.0, 0.0, -0.045), (0.7, 0.52, 0.07), stone, "lectern", place=lectern, bevel=0.012)
    body.box((0.0, -0.255, -0.005), (0.64, 0.03, 0.03), dark, "lectern", place=lectern)
    body.box((0.0, 0.0, -0.105), (0.4, 0.3, 0.06), dark, "lectern", place=lectern)
    place: Matrix = book_place()
    width: float = LEDGER["leaf_width"]
    length: float = LEDGER["leaf_length"]
    cover: float = LEDGER["cover"]
    hinge: Matrix = place @ Matrix.Translation((0.0, 0.0, LEDGER["block"]))
    body.box((width / 2.0, 0.0, -cover / 2.0), (width, length, cover), leather, "book", place=place)
    page_block(body, 1.0, page, "book", place)
    body.box((0.0, 0.0, -cover / 2.0 - 0.004), (0.03, length, cover), leather, "book", place=place)
    body.box((-width / 2.0, 0.0, cover / 2.0 - LEDGER["block"] - cover), (width, length, cover), leather, "leaf", place=hinge)
    page_block(body, -1.0, page, "leaf", hinge @ Matrix.Translation((0.0, 0.0, -LEDGER["block"])))
    for end in (-1.0, 1.0):
        body.box((width - 0.02, end * (length / 2.0 - 0.02), -cover / 2.0), (0.04, 0.04, cover + 0.004), brass, "book", place=place)
        body.box((0.02 - width, end * (length / 2.0 - 0.02), -LEDGER["block"] - cover / 2.0), (0.04, 0.04, cover + 0.004), brass, "leaf", place=hinge)
    body.box((width * 0.46, 0.0, 0.0), (width * 0.88, length - 0.03, 0.003), page, "page", place=hinge @ Matrix.Translation((0.0, 0.0, 0.002)))
    for line in range(6):
        body.box((width * 0.5, 0.12 - line * 0.045, 0.0), (width * 0.62, 0.006, 0.002), ink, "page", place=hinge @ Matrix.Translation((0.0, 0.0, 0.0042)))
    body.build("ledger_plinth", armature)
    return body


def spine() -> Vector:
    return Matrix.Rotation(math.radians(LEDGER["tilt_degrees"]), 3, "X") @ Y


def page_lift(time: float) -> float:
    breath: float = (1.0 - math.cos(2.0 * math.pi * time / LEDGER["idle_seconds"])) / 2.0
    flutter: float = 0.6 * math.sin(4.0 * math.pi * time / LEDGER["idle_seconds"]) ** 2
    return -(2.0 + 5.0 * breath + flutter)


def ledger_idle(armature: Object) -> Callable[[float], Pose]:
    def pose(time: float) -> Pose:
        breath: float = math.sin(2.0 * math.pi * time / LEDGER["idle_seconds"])
        return {
            "root": still(),
            "plinth": still(),
            "lectern": still(),
            "book": still(),
            "leaf": (Vector(), turn(armature, "leaf", spine(), 0.8 * breath)),
            "page": (Vector(), turn(armature, "page", spine(), page_lift(time))),
        }

    return pose


def ledger_hit(armature: Object) -> Callable[[float], Pose]:
    def pose(time: float) -> Pose:
        lean: float = shudder(time, 1.6, 8.0, 10.0)
        twist: float = shudder(time, 1.2, 10.0, 11.0, 0.7)
        hop: float = max(0.0, math.sin(math.pi * ramp(time, 0.0, 0.16))) * 0.03
        flap: float = -28.0 * math.sin(math.pi * ramp(time, 0.02, 0.36))
        return {
            "root": (Vector(), turn(armature, "root", X, lean) @ turn(armature, "root", Z, twist)),
            "plinth": still(),
            "lectern": still(),
            "book": (move(armature, "book", Z * hop), turn(armature, "book", Z, shudder(time, 3.0, 7.0, 9.0))),
            "leaf": (Vector(), turn(armature, "leaf", spine(), 6.0 * math.sin(math.pi * ramp(time, 0.0, 0.3)))),
            "page": (Vector(), turn(armature, "page", spine(), page_lift(0.0) + flap)),
        }

    return pose


def fall_path(time: float) -> tuple[Vector, Quaternion]:
    tilt: float = math.radians(LEDGER["tilt_degrees"])
    down_slope: Vector = Vector((0.0, -math.cos(tilt), -math.sin(tilt)))
    start: Vector = Vector((0.0, 0.0, LEDGER["top_z"]))
    edge: Vector = start + down_slope * 0.28
    floor: Vector = Vector((0.06, -0.66, LEDGER["cover"] + 0.002))
    slide: float = ramp(time, 0.5, 0.8)
    drop: float = ramp(time, 0.8, 1.15)
    flat: Quaternion = Quaternion(X, -tilt)
    land: Quaternion = Quaternion(Z, math.radians(24.0)) @ flat
    if time < 0.8:
        return (start.lerp(edge, slide * slide) - start, Quaternion())
    if time < 1.15:
        across: Vector = edge.lerp(floor, drop)
        across.z = edge.z + (floor.z - edge.z) * drop * drop
        return (across - start, Quaternion().slerp(land, smooth(drop)))
    settle: float = math.exp(-(time - 1.15) * 9.0) * math.sin(math.pi * ramp(time, 1.15, 1.4))
    rock: Quaternion = Quaternion(Y, math.radians(-5.0 * settle))
    return (floor - start, rock @ land)


def ledger_death(armature: Object) -> Callable[[float], Pose]:
    def pose(time: float) -> Pose:
        lean: float = shudder(time, 2.4, 9.0, 8.0) * (1.0 - ramp(time, 0.25, 0.4))
        slam: float = ramp(time, 0.12, 0.42)
        closing: float = 180.0 * slam * slam
        page: float = page_lift(0.0) * (1.0 - smooth(ramp(time, 0.05, 0.3)))
        location, rotation = fall_path(time)
        jolt: float = shudder(max(0.0, time - 0.42), 0.012, 9.0, 14.0) if time > 0.42 else 0.0
        crack: float = smooth(ramp(time, 0.82, 0.98))
        return {
            "root": (Vector(), turn(armature, "root", X, lean) @ turn(armature, "root", Z, shudder(time, 1.5, 7.0, 8.0, 0.6) * (1.0 - ramp(time, 0.25, 0.4)))),
            "plinth": still(),
            "lectern": (move(armature, "lectern", X * 0.02 * crack), turn(armature, "lectern", Y, -6.0 * crack) @ turn(armature, "lectern", X, 3.0 * crack)),
            "book": (move(armature, "book", location + Z * jolt), world_turn(armature, "book", rotation)),
            "leaf": (Vector(), turn(armature, "leaf", spine(), closing)),
            "page": (Vector(), turn(armature, "page", spine(), page)),
        }

    return pose


def export(armature: Object, path: str) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    for child in armature.children:
        child.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_skins=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_frame_step=1,
        export_nla_strips=True,
    )


def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS


def build(directory: str) -> None:
    reset()
    clock: Object = clock_rig()
    clock_body(clock)
    clip(clock, "Clock_Idle", CLOCK["swing_seconds"], clock_idle(clock))
    clip(clock, "Clock_Hit", 0.4, clock_hit(clock))
    clip(clock, "Clock_Death", 2.0, clock_death(clock))
    export(clock, f"{directory}/standing_clock.glb")
    bpy.ops.wm.save_as_mainfile(filepath=f"{directory}/standing_clock.blend")
    reset()
    ledger: Object = ledger_rig()
    ledger_body(ledger)
    clip(ledger, "Ledger_Idle", LEDGER["idle_seconds"], ledger_idle(ledger))
    clip(ledger, "Ledger_Hit", 0.4, ledger_hit(ledger))
    clip(ledger, "Ledger_Death", 2.0, ledger_death(ledger))
    export(ledger, f"{directory}/ledger_plinth.glb")
    bpy.ops.wm.save_as_mainfile(filepath=f"{directory}/ledger_plinth.blend")


if __name__ == "__main__":
    build(sys.argv[sys.argv.index("--") + 1])
