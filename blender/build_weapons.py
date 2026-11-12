import math
import sys
from typing import Sequence

import bmesh
import bpy
from bpy.types import Material, Object

Color = tuple[float, float, float]

STEEL: Color = (0.62, 0.65, 0.7)
EDGE: Color = (0.86, 0.88, 0.9)
DARK_STEEL: Color = (0.2, 0.21, 0.24)
RUST: Color = (0.32, 0.17, 0.09)
BRONZE: Color = (0.48, 0.34, 0.14)
LEATHER: Color = (0.13, 0.08, 0.05)
WOOD: Color = (0.17, 0.11, 0.07)
BONE: Color = (0.62, 0.58, 0.47)
HEX: Color = (0.62, 0.3, 1.0)
SHIELD_OFFSET: float = 0.07


def material(name: str, color: Color, metallic: float, roughness: float, emission: float = 0.0) -> Material:
    made: Material = bpy.data.materials.new(name)
    made.use_nodes = True
    shader = made.node_tree.nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if emission > 0.0:
        shader.inputs["Emission Color"].default_value = (color[0], color[1], color[2], 1.0)
        shader.inputs["Emission Strength"].default_value = emission
    return made


def finish(obj: Object, made: Material) -> Object:
    obj.data.materials.append(made)
    return obj


def blade(name: str, base: float, length: float, width: float, tip_width: float, thickness: float, made: Material) -> Object:
    mesh = bpy.data.meshes.new(name)
    shoulder: float = base + length * 0.82
    ring = lambda z, w: [(-w / 2, 0.0, z), (0.0, -thickness / 2, z), (w / 2, 0.0, z), (0.0, thickness / 2, z)]
    verts: list[tuple[float, float, float]] = ring(base, width) + ring(shoulder, tip_width) + [(0.0, 0.0, base + length)]
    faces: list[Sequence[int]] = [(3, 2, 1, 0)]
    for side in range(4):
        after: int = (side + 1) % 4
        faces.append((side, after, after + 4, side + 4))
        faces.append((side + 4, after + 4, 8))
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj: Object = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return finish(obj, made)


def box(name: str, size: tuple[float, float, float], z: float, made: Material, x: float = 0.0, y: float = 0.0) -> Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, y, z))
    obj: Object = bpy.context.active_object
    obj.name = name
    obj.scale = size
    return finish(obj, made)


def rod(name: str, radius: float, top_radius: float, depth: float, z: float, made: Material, sides: int = 10) -> Object:
    bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=radius, radius2=top_radius, depth=depth, location=(0.0, 0.0, z))
    obj: Object = bpy.context.active_object
    obj.name = name
    return finish(obj, made)


def ball(name: str, radius: float, z: float, made: Material, squash: float = 1.0, y: float = 0.0) -> Object:
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=radius, location=(0.0, y, z))
    obj: Object = bpy.context.active_object
    obj.name = name
    obj.scale = (1.0, 1.0, squash)
    return finish(obj, made)


def prong(name: str, angle: float, z: float, made: Material) -> Object:
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.022, radius2=0.004, depth=0.2, location=(0.0, 0.0, 0.0))
    obj: Object = bpy.context.active_object
    obj.name = name
    obj.rotation_euler = (0.42, 0.0, angle)
    obj.location = (-0.055 * math.sin(angle), -0.055 * math.cos(angle), z)
    return finish(obj, made)


def unwrap(mesh: bmesh.types.BMesh) -> None:
    layer = mesh.loops.layers.uv.verify()
    for face in mesh.faces:
        ax: float = abs(face.normal.x)
        ay: float = abs(face.normal.y)
        az: float = abs(face.normal.z)
        for loop in face.loops:
            co = loop.vert.co
            if az >= ax and az >= ay:
                loop[layer].uv = (co.x, co.y)
            elif ax >= ay:
                loop[layer].uv = (co.y, co.z)
            else:
                loop[layer].uv = (co.x, co.z)


def export(name: str, parts: list[Object], directory: str) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.join()
    joined: Object = bpy.context.active_object
    joined.name = name
    mesh = bmesh.new()
    mesh.from_mesh(joined.data)
    bmesh.ops.recalc_face_normals(mesh, faces=mesh.faces)
    unwrap(mesh)
    mesh.to_mesh(joined.data)
    mesh.free()
    bpy.ops.export_scene.gltf(filepath=f"{directory}/{name}.glb", export_format="GLB", use_selection=True, export_apply=True, export_yup=True)
    bpy.data.objects.remove(joined, do_unlink=True)


def build(directory: str) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    steel: Material = material("steel", STEEL, 0.95, 0.32)
    edge: Material = material("edge", EDGE, 0.95, 0.2)
    dark: Material = material("dark_steel", DARK_STEEL, 0.9, 0.45)
    rust: Material = material("rust", RUST, 0.55, 0.85)
    bronze: Material = material("bronze", BRONZE, 0.9, 0.4)
    leather: Material = material("leather", LEATHER, 0.0, 0.8)
    wood: Material = material("wood", WOOD, 0.0, 0.85)
    bone: Material = material("bone", BONE, 0.0, 0.7)
    hex_glow: Material = material("hex_glow", HEX, 0.0, 0.3, 6.0)

    export(
        "sword_1h",
        [
            blade("blade", 0.1, 0.86, 0.058, 0.04, 0.014, steel),
            box("guard", (0.21, 0.03, 0.026), 0.09, bronze),
            rod("grip", 0.016, 0.014, 0.16, 0.0, leather),
            ball("pommel", 0.027, -0.1, bronze, 0.8),
        ],
        directory,
    )
    export(
        "broadsword",
        [
            blade("blade_edge", 0.1, 0.8, 0.105, 0.08, 0.012, edge),
            blade("blade", 0.1, 0.78, 0.07, 0.052, 0.02, steel),
            box("guard", (0.24, 0.036, 0.03), 0.09, dark),
            rod("grip", 0.018, 0.016, 0.17, 0.0, leather),
            ball("pommel", 0.032, -0.1, dark, 0.8),
        ],
        directory,
    )
    export(
        "greatsword",
        [
            blade("blade", 0.2, 1.3, 0.085, 0.06, 0.018, steel),
            box("guard", (0.34, 0.04, 0.035), 0.185, dark),
            box("guard_core", (0.07, 0.05, 0.07), 0.185, bronze),
            rod("grip", 0.019, 0.017, 0.34, 0.0, leather),
            ball("pommel", 0.036, -0.19, dark, 0.9),
        ],
        directory,
    )
    export(
        "rusted_blade",
        [
            blade("blade", 0.08, 0.6, 0.06, 0.095, 0.012, rust),
            box("guard", (0.11, 0.028, 0.02), 0.07, rust),
            rod("grip", 0.016, 0.015, 0.14, 0.0, leather),
        ],
        directory,
    )
    export(
        "hex_staff",
        [
            rod("shaft", 0.02, 0.026, 1.75, 0.2, wood, 8),
            ball("knot", 0.04, 1.05, wood, 1.3),
            prong("prong_a", 0.0, 1.16, bone),
            prong("prong_b", 2.094, 1.16, bone),
            prong("prong_c", 4.188, 1.16, bone),
            ball("crystal", 0.06, 1.2, hex_glow, 1.5),
            ball("ferrule", 0.028, -0.67, dark, 1.0),
        ],
        directory,
    )
    export(
        "war_maul",
        [
            rod("shaft", 0.024, 0.022, 1.25, 0.4, wood, 8),
            box("head", (0.34, 0.17, 0.2), 0.98, dark),
            box("face_a", (0.03, 0.19, 0.22), 0.98, rust, 0.17),
            box("face_b", (0.03, 0.19, 0.22), 0.98, rust, -0.17),
            box("band", (0.07, 0.19, 0.06), 0.98, bronze),
            ball("cap", 0.035, 1.09, dark, 0.7),
            rod("wrap", 0.028, 0.028, 0.28, -0.05, leather),
            ball("butt", 0.032, -0.23, dark, 1.0),
        ],
        directory,
    )
    export(
        "tower_shield",
        [
            box("board", (0.62, 0.05, 1.02), 0.12, wood, 0.0, SHIELD_OFFSET),
            box("rim_top", (0.66, 0.062, 0.05), 0.63, dark, 0.0, SHIELD_OFFSET),
            box("rim_bottom", (0.66, 0.062, 0.05), -0.39, dark, 0.0, SHIELD_OFFSET),
            box("rim_left", (0.05, 0.062, 1.07), 0.12, dark, -0.305, SHIELD_OFFSET),
            box("rim_right", (0.05, 0.062, 1.07), 0.12, dark, 0.305, SHIELD_OFFSET),
            box("brace", (0.56, 0.058, 0.06), 0.12, rust, 0.0, SHIELD_OFFSET),
            ball("boss", 0.11, 0.12, dark, 1.0, SHIELD_OFFSET * 1.4),
            rod("grip", 0.016, 0.016, 0.2, 0.0, leather),
            box("strap_top", (0.034, SHIELD_OFFSET * 0.75, 0.03), 0.085, leather, 0.0, SHIELD_OFFSET * 0.36),
            box("strap_bottom", (0.034, SHIELD_OFFSET * 0.75, 0.03), -0.085, leather, 0.0, SHIELD_OFFSET * 0.36),
        ],
        directory,
    )
    export(
        "bone_javelin",
        [
            rod("shaft", 0.014, 0.012, 1.5, 0.35, wood, 6),
            rod("point", 0.03, 0.002, 0.3, 1.25, bone, 6),
            box("binding", (0.04, 0.04, 0.06), 1.09, leather),
        ],
        directory,
    )


build(sys.argv[sys.argv.index("--") + 1])
