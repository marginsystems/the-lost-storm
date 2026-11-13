from dataclasses import dataclass
from pathlib import Path

import bmesh
import bpy
import numpy as np
from bpy.types import Image, Material, Object
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

SIDES: tuple[str, ...] = ("R", "L")
DIGITS: tuple[str, ...] = ("index", "middle", "ring", "pinky", "thumb")
WELD: float = 0.00002
SUBDIVISIONS: int = 1
FREE_FINGER: float = 0.85
FIT_FROM: float = 0.3
FIT_SPAN: float = 0.6
SIDE_REACH: float = 0.2
SEAM_BLEND: float = 0.03
SEAM_LIFT: float = 0.0006
ARM_UNDER: float = 0.004
CUT_REACH: float = 0.3
SMOOTH_SHARE: float = 0.5
SMOOTH_PASSES: int = 3
MAX_INFLUENCES: int = 4
WEIGHT_FLOOR: float = 0.001
BAKE_CAGE: float = 0.02
BAKE_SAMPLES: int = 4
BAKE_MARGIN: int = 8
DARK_BAKE: float = 0.15


@dataclass(frozen=True)
class HandSource:
    file: Path
    mesh: str
    material: str


@dataclass(frozen=True)
class Cut:
    head: np.ndarray
    axis: np.ndarray
    depth: float


def chain(digit: str, side: str) -> list[str]:
    stem: str = "DEF-thumb" if digit == "thumb" else f"DEF-f_{digit}"
    return [f"{stem}.0{segment}.{side}" for segment in (1, 2, 3)]


def head_of(rig: Object, bone: str) -> np.ndarray:
    return np.array(rig.matrix_world @ rig.data.bones[bone].head_local)


def tail_of(rig: Object, bone: str) -> np.ndarray:
    return np.array(rig.matrix_world @ rig.data.bones[bone].tail_local)


def chain_points(rig: Object, digit: str, side: str) -> np.ndarray:
    bones: list[str] = chain(digit, side)
    used: list[str] = bones[1:] if digit == "thumb" else bones
    return np.array([*(head_of(rig, bone) for bone in used), tail_of(rig, bones[2])])


def joint_axes(rig_path: Path) -> Object:
    before: set[str] = {obj.name for obj in bpy.data.objects}
    bpy.ops.import_scene.gltf(filepath=str(rig_path), bone_heuristic="BLENDER")
    imported: list[Object] = [obj for obj in bpy.data.objects if obj.name not in before]
    armatures: list[Object] = [obj for obj in imported if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"hand graft: {rig_path.name} has no single armature")
    for obj in imported:
        if obj != armatures[0]:
            bpy.data.objects.remove(obj)
    return armatures[0]


def fitted_line(points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    centre: np.ndarray = points.mean(axis=0)
    _, _, rows = np.linalg.svd(points - centre)
    return centre, rows[0]


def smoothstep(values: np.ndarray) -> np.ndarray:
    clipped: np.ndarray = np.clip(values, 0.0, 1.0)
    return clipped * clipped * (3.0 - 2.0 * clipped)


def import_hands(source: HandSource, label: str) -> Object:
    before: set[str] = {obj.name for obj in bpy.data.objects}
    bpy.ops.import_scene.gltf(filepath=str(source.file))
    imported: list[Object] = [obj for obj in bpy.data.objects if obj.name not in before]
    meshes: list[Object] = [obj for obj in imported if obj.type == "MESH" and obj.name == source.mesh]
    if len(meshes) != 1:
        raise RuntimeError(f"{label}: {source.file.name} has no single mesh called {source.mesh}")
    hands: Object = meshes[0]
    slots: list[int] = [index for index, made in enumerate(hands.data.materials) if made is not None and made.name.split(".")[0] == source.material]
    if len(slots) != 1:
        raise RuntimeError(f"{label}: {source.mesh} has no material called {source.material}")
    world: Matrix = hands.matrix_world.copy()
    hands.parent = None
    hands.matrix_world = world
    for obj in imported:
        if obj != hands:
            bpy.data.objects.remove(obj)
    for modifier in list(hands.modifiers):
        hands.modifiers.remove(modifier)
    if hands.data.shape_keys is not None:
        hands.shape_key_clear()
    mesh = bmesh.new()
    mesh.from_mesh(hands.data)
    bmesh.ops.delete(mesh, geom=[face for face in mesh.faces if face.material_index != slots[0]], context="FACES")
    bmesh.ops.delete(mesh, geom=[vert for vert in mesh.verts if not vert.link_faces], context="VERTS")
    bmesh.ops.remove_doubles(mesh, verts=list(mesh.verts), dist=WELD)
    mesh.to_mesh(hands.data)
    mesh.free()
    hands.data.transform(hands.matrix_world)
    hands.matrix_world = Matrix.Identity(4)
    hands.data.materials.clear()
    for polygon in hands.data.polygons:
        polygon.use_smooth = True
    if hands.data.has_custom_normals:
        with bpy.context.temp_override(object=hands, active_object=hands, selected_objects=[hands], selected_editable_objects=[hands]):
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
    subdivide(hands)
    return hands


def subdivide(obj: Object) -> None:
    modifier = obj.modifiers.new("subdivide", "SUBSURF")
    modifier.levels = SUBDIVISIONS
    modifier.render_levels = SUBDIVISIONS
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def read_weights(obj: Object) -> dict[str, np.ndarray]:
    count: int = len(obj.data.vertices)
    names: dict[int, str] = {group.index: group.name for group in obj.vertex_groups}
    weights: dict[str, np.ndarray] = {}
    for vertex in obj.data.vertices:
        for entry in vertex.groups:
            weights.setdefault(names[entry.group], np.zeros(count))[vertex.index] = entry.weight
    return weights


def write_weights(obj: Object, weights: dict[str, np.ndarray]) -> None:
    for group in list(obj.vertex_groups):
        obj.vertex_groups.remove(group)
    for name, values in weights.items():
        used = np.nonzero(values > WEIGHT_FLOOR)[0]
        if len(used) == 0:
            continue
        group = obj.vertex_groups.new(name=name)
        for vertex in used:
            group.add([int(vertex)], float(values[vertex]), "REPLACE")


def points_of(obj: Object) -> np.ndarray:
    values = np.empty(len(obj.data.vertices) * 3, dtype=np.float64)
    obj.data.vertices.foreach_get("co", values)
    return values.reshape(-1, 3)


def weight_of(weights: dict[str, np.ndarray], name: str, count: int) -> np.ndarray:
    return weights.get(name, np.zeros(count))


def fit_fingers(points: np.ndarray, weights: dict[str, np.ndarray], rig: Object) -> np.ndarray:
    count: int = len(points)
    moved: np.ndarray = points.copy()
    for side in SIDES:
        for digit in DIGITS:
            bones: list[str] = chain(digit, side)
            used: list[str] = bones[1:] if digit == "thumb" else bones
            share: np.ndarray = sum((weight_of(weights, bone, count) for bone in used), np.zeros(count))
            free = share > FREE_FINGER
            if free.sum() < 3:
                raise RuntimeError(f"hand graft: no {digit} finger found on side {side}")
            mesh_centre, mesh_axis = fitted_line(points[free])
            rig_points: np.ndarray = chain_points(rig, digit, side)
            rig_centre, rig_axis = fitted_line(rig_points)
            toward_tip: np.ndarray = rig_points[-1] - rig_points[0]
            if rig_axis @ toward_tip < 0:
                rig_axis = -rig_axis
            if mesh_axis @ toward_tip < 0:
                mesh_axis = -mesh_axis
            turn = np.array(Vector(mesh_axis).rotation_difference(Vector(rig_axis)).to_matrix())
            landing: np.ndarray = rig_centre + rig_axis * ((mesh_centre - rig_centre) @ rig_axis)
            placed: np.ndarray = landing + (points - mesh_centre) @ turn.T
            blend: np.ndarray = smoothstep((share - FIT_FROM) / FIT_SPAN)[:, None]
            moved = moved + blend * (placed - points)
    return moved


def seam_cuts(points: np.ndarray, hands: Object, rig: Object) -> list[Cut]:
    mesh = bmesh.new()
    mesh.from_mesh(hands.data)
    rim: list[int] = sorted({vert.index for edge in mesh.edges if edge.is_boundary for vert in edge.verts})
    mesh.free()
    cuts: list[Cut] = []
    for side in SIDES:
        head: np.ndarray = head_of(rig, f"DEF-hand.{side}")
        axis: np.ndarray = tail_of(rig, f"DEF-hand.{side}") - head
        axis = axis / np.linalg.norm(axis)
        near: list[int] = [index for index in rim if np.linalg.norm(points[index] - head) < SIDE_REACH]
        if not near:
            raise RuntimeError(f"hand graft: no wrist rim on side {side}")
        cuts.append(Cut(head, axis, float(min((points[index] - head) @ axis for index in near))))
    return cuts


def blend_seam(points: np.ndarray, weights: dict[str, np.ndarray], body: Object, cuts: list[Cut]) -> np.ndarray:
    count: int = len(points)
    surface = bmesh.new()
    surface.from_mesh(body.data)
    surface.transform(body.matrix_world)
    tree: BVHTree = BVHTree.FromBMesh(surface)
    surface.free()
    body_points: np.ndarray = points_of(body) @ np.array(body.matrix_world)[:3, :3].T + np.array(body.matrix_world)[:3, 3]
    body_weights: dict[str, np.ndarray] = read_weights(body)
    placed: np.ndarray = points.copy()
    for cut in cuts:
        near_side: np.ndarray = np.linalg.norm(points - cut.head, axis=1) < SIDE_REACH
        along: np.ndarray = (points - cut.head) @ cut.axis
        share: np.ndarray = smoothstep(1.0 - (along - cut.depth) / SEAM_BLEND) * near_side
        for index in np.nonzero(share > 0)[0]:
            hit, normal, _, _ = tree.find_nearest(Vector(points[index]))
            if hit is None or normal is None:
                continue
            placed[index] = points[index] + share[index] * (np.array(hit) + np.array(normal) * SEAM_LIFT - points[index])
            nearest: int = int(np.argmin(np.linalg.norm(body_points - placed[index], axis=1)))
            names: set[str] = {name for name, values in weights.items() if values[index] > 0} | {name for name, values in body_weights.items() if values[nearest] > 0}
            mixed: dict[str, float] = {name: (1 - share[index]) * weight_of(weights, name, count)[index] + share[index] * weight_of(body_weights, name, len(body_points))[nearest] for name in names}
            total: float = sum(mixed.values())
            for name, value in mixed.items():
                weights.setdefault(name, np.zeros(count))[index] = value / total if total > 0 else 0.0
    return placed


def smooth_weights(obj: Object, weights: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    count: int = len(obj.data.vertices)
    edges = np.array([tuple(edge.vertices) for edge in obj.data.edges], dtype=np.int64)
    degree: np.ndarray = np.bincount(edges.ravel(), minlength=count).astype(np.float64)
    smoothed: dict[str, np.ndarray] = dict(weights)
    hand_groups: list[str] = [name for name in weights if "f_" in name or "thumb" in name or name.startswith("DEF-hand")]
    for _ in range(SMOOTH_PASSES):
        for name in hand_groups:
            values: np.ndarray = smoothed[name]
            total = np.zeros(count)
            np.add.at(total, edges[:, 0], values[edges[:, 1]])
            np.add.at(total, edges[:, 1], values[edges[:, 0]])
            mean: np.ndarray = np.where(degree > 0, total / np.maximum(degree, 1.0), values)
            smoothed[name] = values + SMOOTH_SHARE * (mean - values)
    names: list[str] = list(smoothed)
    table: np.ndarray = np.stack([smoothed[name] for name in names], axis=1)
    weakest = np.argsort(-table, axis=1)[:, MAX_INFLUENCES:]
    np.put_along_axis(table, weakest, 0.0, axis=1)
    table = table / np.maximum(table.sum(axis=1, keepdims=True), 1e-9)
    return {name: table[:, index] for index, name in enumerate(names)}


def cut_body(body: Object, cuts: list[Cut]) -> None:
    mesh = bmesh.new()
    mesh.from_mesh(body.data)
    world: Matrix = body.matrix_world
    to_local: Matrix = world.inverted()
    normal_to_local = world.to_3x3().transposed()
    for cut in cuts:
        point = Vector(cut.head + cut.axis * (cut.depth + ARM_UNDER))
        near = [vert for vert in mesh.verts if (world @ vert.co - Vector(cut.head)).length < CUT_REACH]
        geom = near + list({edge for vert in near for edge in vert.link_edges}) + list({face for vert in near for face in vert.link_faces})
        bmesh.ops.bisect_plane(mesh, geom=geom, plane_co=to_local @ point, plane_no=(normal_to_local @ Vector(cut.axis)).normalized(), clear_outer=True, dist=1e-6)
    bmesh.ops.delete(mesh, geom=[vert for vert in mesh.verts if not vert.link_faces], context="VERTS")
    mesh.to_mesh(body.data)
    mesh.free()
    body.data.update()


def bake_skin(hands: Object, body: Object, name: str, size: int, scratch: Path) -> Image:
    image: Image = bpy.data.images.new(f"{name}_color", size, size)
    image.colorspace_settings.name = "sRGB"
    made: Material = bpy.data.materials.new(f"M_{name}")
    made.use_nodes = True
    made.use_backface_culling = False
    nodes = made.node_tree.nodes
    shader = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    color = nodes.new("ShaderNodeTexImage")
    color.image = image
    made.node_tree.links.new(color.outputs["Color"], shader.inputs["Base Color"])
    nodes.active = color
    hands.data.materials.append(made)
    scene = bpy.context.scene
    engine: str = scene.render.engine
    scene.render.engine = "CYCLES"
    scene.cycles.samples = BAKE_SAMPLES
    bake = scene.render.bake
    bake.use_selected_to_active = True
    bake.cage_extrusion = BAKE_CAGE
    bake.max_ray_distance = 0.0
    bake.use_pass_direct = False
    bake.use_pass_indirect = False
    bake.use_pass_color = True
    bake.margin = BAKE_MARGIN
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    hands.select_set(True)
    bpy.context.view_layer.objects.active = hands
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"})
    scene.render.engine = engine
    pixels: np.ndarray = np.array(image.pixels[:]).reshape(-1, 4)
    dark = pixels[:, :3].mean(axis=1) <= DARK_BAKE
    if (~dark).any():
        pixels[dark] = np.median(pixels[~dark], axis=0)
    image.pixels = pixels.reshape(-1)
    path: Path = scratch / f"{name}_color.png"
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    return image


def graft_hands(body: Object, rig_path: Path, source: HandSource, name: str, size: int, scratch: Path) -> Object:
    rig: Object = joint_axes(rig_path)
    hands: Object = import_hands(source, name)
    weights: dict[str, np.ndarray] = read_weights(hands)
    points: np.ndarray = fit_fingers(points_of(hands), weights, rig)
    hands.data.vertices.foreach_set("co", points.reshape(-1))
    cuts: list[Cut] = seam_cuts(points, hands, rig)
    armature = rig.data
    bpy.data.objects.remove(rig)
    bpy.data.armatures.remove(armature)
    points = blend_seam(points, weights, body, cuts)
    hands.data.vertices.foreach_set("co", points.reshape(-1))
    hands.data.update()
    write_weights(hands, smooth_weights(hands, weights))
    bake_skin(hands, body, name, size, scratch)
    cut_body(body, cuts)
    hands.name = name
    hands.data.name = name
    return hands
