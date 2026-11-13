import sys
from pathlib import Path

import bmesh
import bpy
from bpy.types import Material, Object
from mathutils import Vector
from mathutils.kdtree import KDTree

MERGE: float = 0.0004
NORMAL_PASSES: int = 2


def argument_map(arguments: list[str]) -> dict[str, str]:
    pairs: dict[str, str] = {}
    for argument in arguments:
        key, _, value = argument.partition("=")
        pairs[key] = value
    return pairs


def import_body(path: Path) -> list[Object]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return list(bpy.context.scene.objects)


def named(objects: list[Object], name: str) -> Object:
    for obj in objects:
        if obj.type == "MESH" and (obj.name == name or obj.data.name == name):
            return obj
    raise SystemExit(f"no mesh named {name}")


def armature_of(objects: list[Object]) -> Object:
    rigs: list[Object] = [obj for obj in objects if obj.type == "ARMATURE"]
    if len(rigs) != 1:
        raise SystemExit(f"expected one armature, found {len(rigs)}")
    return rigs[0]


def rim_points(hands: Object) -> KDTree:
    mesh = bmesh.new()
    mesh.from_mesh(hands.data)
    rim: list[Vector] = [hands.matrix_world @ vert.co for vert in mesh.verts if any(edge.is_boundary for edge in vert.link_edges)]
    mesh.free()
    tree: KDTree = KDTree(len(rim))
    for index, point in enumerate(rim):
        tree.insert(point, index)
    tree.balance()
    return tree


def copy_of(obj: Object, name: str) -> Object:
    clone: Object = obj.copy()
    clone.data = obj.data.copy()
    clone.name = name
    bpy.context.scene.collection.objects.link(clone)
    return clone


def keep_cuff(arm: Object, rim: KDTree, cuff: float) -> None:
    mesh = bmesh.new()
    mesh.from_mesh(arm.data)
    near: set[int] = {vert.index for vert in mesh.verts if rim.find(arm.matrix_world @ vert.co)[2] <= cuff}
    doomed = [face for face in mesh.faces if not all(vert.index in near for vert in face.verts)]
    bmesh.ops.delete(mesh, geom=doomed, context="FACES")
    loose = [vert for vert in mesh.verts if not vert.link_faces]
    bmesh.ops.delete(mesh, geom=loose, context="VERTS")
    mesh.to_mesh(arm.data)
    mesh.free()


def join(parts: list[Object], name: str) -> Object:
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    joined: Object = bpy.context.view_layer.objects.active
    joined.name = name
    joined.data.name = name
    return joined


def lift(shell: Object, distance: float) -> None:
    mesh = bmesh.new()
    mesh.from_mesh(shell.data)
    bmesh.ops.remove_doubles(mesh, verts=list(mesh.verts), dist=MERGE)
    bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
    for _ in range(NORMAL_PASSES):
        mesh.normal_update()
    moves: list[Vector] = [vert.normal.copy() * distance for vert in mesh.verts]
    for vert, move in zip(mesh.verts, moves):
        vert.co += move
    mesh.to_mesh(shell.data)
    mesh.free()


def reduce(shell: Object, ratio: float) -> None:
    modifier = shell.modifiers.new("reduce", "DECIMATE")
    modifier.ratio = ratio
    bpy.context.view_layer.objects.active = shell
    bpy.ops.object.modifier_move_to_index(modifier=modifier.name, index=0)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def leather(name: str, colour: tuple[float, float, float], roughness: float) -> Material:
    material: Material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (*colour, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    return material


def build(arguments: dict[str, str]) -> None:
    body_path: Path = Path(arguments["body"])
    out: Path = Path(arguments["out"])
    name: str = arguments["name"]
    cuff: float = float(arguments["cuff"])
    distance: float = float(arguments["lift"])
    colour: tuple[float, float, float] = tuple(float(part) for part in arguments["colour"].split(","))
    roughness: float = float(arguments["roughness"])
    objects: list[Object] = import_body(body_path)
    rig: Object = armature_of(objects)
    hands: Object = named(objects, arguments["hands"])
    body: Object = named(objects, arguments["skin"])
    rim: KDTree = rim_points(hands)
    hand_copy: Object = copy_of(hands, f"{name}_hand")
    arm_copy: Object = copy_of(body, f"{name}_cuff")
    keep_cuff(arm_copy, rim, cuff)
    shell: Object = join([hand_copy, arm_copy], name)
    lift(shell, distance)
    for attribute in list(shell.data.color_attributes):
        shell.data.color_attributes.remove(attribute)
    reduce(shell, float(arguments["decimate"]))
    shell.data.materials.clear()
    shell.data.materials.append(leather(name, colour, roughness))
    keep: set[str] = {shell.name, rig.name}
    for obj in list(bpy.context.scene.objects):
        if obj.name not in keep:
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.object.select_all(action="DESELECT")
    shell.select_set(True)
    rig.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(out), export_format="GLB", use_selection=True, export_skins=True, export_animations=False, export_morph=False, export_yup=True)


build(argument_map(sys.argv[sys.argv.index("--") + 1 :]))
