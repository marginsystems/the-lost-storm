import math
import sys
from typing import Sequence

import bmesh
import bpy
from bpy.types import Material, Object
from mathutils import Vector

Color = tuple[float, float, float]
Point = tuple[float, float, float]
Ring = tuple[Point, Point, Point, Point]

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
CROSSBOW: dict[str, float] = {
    "side": -0.003,
    "deck": 0.074,
    "rail": 0.1,
    "prod_x": 0.33,
    "prod_z": 0.078,
    "span": 0.25,
    "sweep": 0.085,
    "nut_x": 0.06,
    "bolt_tip": 0.4,
}


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


def beam(name: str, start: Point, end: Point, width: float, thickness: float, made: Material) -> Object:
    along: Vector = Vector(end) - Vector(start)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(Vector(start) + Vector(end)) / 2)
    obj: Object = bpy.context.active_object
    obj.name = name
    obj.scale = (along.length, width, thickness)
    obj.rotation_euler = along.to_track_quat("X", "Z").to_euler()
    return finish(obj, made)


def spike(name: str, base: Point, length: float, radius: float, made: Material) -> Object:
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=radius, radius2=0.001, depth=length, location=(base[0] + length / 2, base[1], base[2]))
    obj: Object = bpy.context.active_object
    obj.name = name
    obj.rotation_euler = (0.0, math.pi / 2, 0.0)
    return finish(obj, made)


def across(x: float, z: float, width: float, height: float) -> Ring:
    y: float = CROSSBOW["side"]
    return ((x, y - width / 2, z - height / 2), (x, y + width / 2, z - height / 2), (x, y + width / 2, z + height / 2), (x, y - width / 2, z + height / 2))


def level(x: float, z: float, length: float, width: float) -> Ring:
    y: float = CROSSBOW["side"]
    return ((x - length / 2, y - width / 2, z), (x + length / 2, y - width / 2, z), (x + length / 2, y + width / 2, z), (x - length / 2, y + width / 2, z))


def loft(name: str, rings: Sequence[Ring], made: Material) -> Object:
    mesh = bpy.data.meshes.new(name)
    verts: list[Point] = [corner for ring in rings for corner in ring]
    faces: list[Sequence[int]] = [(0, 1, 2, 3), tuple(len(verts) - 4 + corner for corner in (3, 2, 1, 0))]
    for index in range(len(rings) - 1):
        low: int = index * 4
        for side in range(4):
            after: int = (side + 1) % 4
            faces.append((low + side, low + after, low + after + 4, low + side + 4))
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj: Object = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return finish(obj, made)


def limb(name: str, side: float, made: Material) -> list[Object]:
    y: float = CROSSBOW["side"]
    root: Point = (CROSSBOW["prod_x"], y, CROSSBOW["prod_z"])
    elbow: Point = (CROSSBOW["prod_x"] - 0.012, y + side * CROSSBOW["span"] * 0.5, CROSSBOW["prod_z"])
    tip: Point = (CROSSBOW["prod_x"] - CROSSBOW["sweep"], y + side * CROSSBOW["span"], CROSSBOW["prod_z"])
    return [
        beam(f"{name}_inner", root, elbow, 0.03, 0.016, made),
        beam(f"{name}_outer", elbow, tip, 0.022, 0.012, made),
    ]


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
    side: float = CROSSBOW["side"]
    string_x: float = CROSSBOW["prod_x"] - CROSSBOW["sweep"]
    nut: Point = (CROSSBOW["nut_x"], side, CROSSBOW["rail"])
    shaft_z: float = CROSSBOW["rail"] + 0.004
    export(
        "hand_crossbow",
        [
            loft("grip", [level(-0.0288, -0.058, 0.017, 0.016), level(-0.009, 0.011, 0.022, 0.018), level(0.0022, 0.054, 0.023, 0.018)], leather),
            loft("butt_cap", [level(-0.031, -0.066, 0.021, 0.02), level(-0.0288, -0.058, 0.021, 0.02)], dark),
            loft(
                "tiller",
                [across(-0.11, 0.07, 0.03, 0.036), across(-0.06, 0.074, 0.038, 0.044), across(0.05, 0.074, 0.036, 0.04), across(0.3, 0.076, 0.03, 0.034), across(0.37, 0.078, 0.026, 0.028)],
                wood,
            ),
            beam("tickler", (0.031, side, 0.054), (0.037, side, 0.031), 0.006, 0.005, dark),
            box("lock", (0.036, 0.04, 0.012), CROSSBOW["rail"] - 0.006, bronze, CROSSBOW["nut_x"], side),
            box("binding", (0.03, 0.046, 0.05), CROSSBOW["prod_z"], bronze, CROSSBOW["prod_x"], side),
            *limb("limb_left", 1.0, dark),
            *limb("limb_right", -1.0, dark),
            beam("string_left", (string_x, side + CROSSBOW["span"], CROSSBOW["prod_z"] + 0.008), nut, 0.005, 0.005, bone),
            beam("string_right", (string_x, side - CROSSBOW["span"], CROSSBOW["prod_z"] + 0.008), nut, 0.005, 0.005, bone),
            beam("bolt_shaft", (CROSSBOW["nut_x"], side, shaft_z), (CROSSBOW["bolt_tip"], side, shaft_z), 0.009, 0.009, wood),
            spike("bolt_head", (CROSSBOW["bolt_tip"], side, shaft_z), 0.06, 0.014, steel),
            beam("fletch_flat", (CROSSBOW["nut_x"] + 0.004, side, shaft_z), (CROSSBOW["nut_x"] + 0.07, side, shaft_z), 0.03, 0.002, bone),
            beam("fletch_up", (CROSSBOW["nut_x"] + 0.004, side, shaft_z + 0.008), (CROSSBOW["nut_x"] + 0.07, side, shaft_z + 0.008), 0.002, 0.018, bone),
        ],
        directory,
    )


build(sys.argv[sys.argv.index("--") + 1])
