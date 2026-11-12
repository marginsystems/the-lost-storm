import math
from typing import Callable

import bmesh
import bpy
from bmesh.types import BMesh
from bpy.types import Object

FIGURE_HEIGHT: float = 1.75
ARM_DROP: float = math.radians(74.0)
BOW_STEPS: list[tuple[str, float]] = [("DEF-spine.002", 7.0), ("DEF-spine.003", 11.0), ("DEF-neck", 24.0), ("DEF-head", 20.0)]
SHOULDER_DROP: float = math.radians(9.0)
SKIN_KEEP: tuple[str, ...] = ("head", "neck", "hand", "f_", "thumb", "foot", "toe")
BUDGET: dict[str, int] = {"robe": 880, "hood": 240, "body": 260}
ROBE_PATH: str = "public/models/wear/monk_robe.glb"
HOOD_PATH: str = "public/models/wear/monk_hood.glb"
BODY_PATH: str = "public/models/characters/human_man.glb"


def load(path: str) -> tuple[Object, Object]:
    before: set[str] = {obj.name for obj in bpy.data.objects}
    bpy.ops.import_scene.gltf(filepath=path)
    fresh: list[Object] = [obj for obj in bpy.data.objects if obj.name not in before]
    armature: Object = next(obj for obj in fresh if obj.type == "ARMATURE")
    shell: Object = next(obj for obj in fresh if obj.type == "MESH" and any(m.type == "ARMATURE" for m in obj.modifiers) and not obj.name.endswith("_eyes"))
    return armature, shell


def head_y(armature: Object) -> float:
    return (armature.matrix_world @ armature.pose.bones["DEF-head"].tail).y


def hand_z(armature: Object, side: str) -> float:
    return (armature.matrix_world @ armature.pose.bones[f"DEF-hand.{side}"].head).z


def turn(armature: Object, bone: str, axis: int, angle: float, measure: Callable[[], float]) -> None:
    pose = armature.pose.bones[bone]
    pose.rotation_mode = "XYZ"
    best: float = 0.0
    best_value: float | None = None
    for sign in (1.0, -1.0):
        euler: list[float] = list(pose.rotation_euler)
        euler[axis] = sign * angle
        pose.rotation_euler = euler
        bpy.context.view_layer.update()
        value: float = measure()
        if best_value is None or value < best_value:
            best_value = value
            best = sign * angle
    euler = list(pose.rotation_euler)
    euler[axis] = best
    pose.rotation_euler = euler
    bpy.context.view_layer.update()


def pose(armature: Object, bowed: bool) -> None:
    for side in ("L", "R"):
        turn(armature, f"DEF-upper_arm.{side}", 2, ARM_DROP, lambda side=side: hand_z(armature, side))
    if not bowed:
        return
    for side in ("L", "R"):
        turn(armature, f"DEF-shoulder.{side}", 2, SHOULDER_DROP, lambda side=side: (armature.matrix_world @ armature.pose.bones[f"DEF-upper_arm.{side}"].head).z)
    for bone, degrees in BOW_STEPS:
        turn(armature, bone, 0, math.radians(degrees), lambda: head_y(armature))


def baked(shell: Object) -> BMesh:
    graph = bpy.context.evaluated_depsgraph_get()
    evaluated: Object = shell.evaluated_get(graph)
    mesh = bpy.data.meshes.new_from_object(evaluated)
    mesh.transform(shell.matrix_world)
    made: BMesh = bmesh.new()
    made.from_mesh(mesh)
    return made


def trim_body(made: BMesh, shell: Object) -> None:
    layer = made.verts.layers.deform.active
    wanted: set[int] = {group.index for group in shell.vertex_groups if any(key in group.name for key in SKIN_KEEP)}
    keep: set[int] = set()
    for vert in made.verts:
        if layer is not None and any(index in wanted and weight > 0.3 for index, weight in vert[layer].items()):
            keep.add(vert.index)
    drop = [face for face in made.faces if not any(vert.index in keep for vert in face.verts)]
    bmesh.ops.delete(made, geom=drop, context="FACES")
    loose = [vert for vert in made.verts if not vert.link_faces]
    bmesh.ops.delete(made, geom=loose, context="VERTS")


def reduced(made: BMesh, target: int) -> BMesh:
    bmesh.ops.triangulate(made, faces=made.faces[:])
    mesh = bpy.data.meshes.new("reduce")
    made.to_mesh(mesh)
    made.free()
    holder: Object = bpy.data.objects.new("reduce", mesh)
    bpy.context.scene.collection.objects.link(holder)
    modifier = holder.modifiers.new("collapse", "DECIMATE")
    modifier.ratio = min(1.0, target / max(1, len(mesh.polygons)))
    graph = bpy.context.evaluated_depsgraph_get()
    result = bpy.data.meshes.new_from_object(holder.evaluated_get(graph))
    out: BMesh = bmesh.new()
    out.from_mesh(result)
    for face in out.faces:
        face.smooth = True
    return out


def figure(bowed: bool) -> tuple[BMesh, BMesh]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cloth: BMesh = bmesh.new()
    skin: BMesh = bmesh.new()
    pieces: list[tuple[str, str]] = [("robe", ROBE_PATH), ("hood", HOOD_PATH), ("body", BODY_PATH)]
    for key, path in pieces:
        armature, shell = load(path)
        pose(armature, bowed)
        made: BMesh = baked(shell)
        if key == "body":
            trim_body(made, shell)
        made = reduced(made, BUDGET[key])
        target: BMesh = skin if key == "body" else cloth
        mesh = bpy.data.meshes.new(key)
        made.to_mesh(mesh)
        made.free()
        target.from_mesh(mesh)
    return cloth, skin


def standing_scale() -> float:
    cloth, skin = figure(False)
    verts = list(cloth.verts) + list(skin.verts)
    scale: float = FIGURE_HEIGHT / (max(vert.co.z for vert in verts) - min(vert.co.z for vert in verts))
    cloth.free()
    skin.free()
    return scale


def fitted(cloth: BMesh, skin: BMesh, scale: float) -> None:
    low: float = min(vert.co.z for vert in list(cloth.verts) + list(skin.verts))
    for made in (cloth, skin):
        for vert in made.verts:
            vert.co.z -= low
            vert.co *= scale
