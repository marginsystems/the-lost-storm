from dataclasses import dataclass

import bmesh
import bpy
import numpy as np
from bpy.types import Object
from mathutils import Matrix, Vector

SIDES: tuple[tuple[str, str], ...] = (("L", "l"), ("R", "r"))
FINGERS: tuple[str, ...] = ("index", "middle", "ring", "pinky")
MAX_INFLUENCES: int = 4
WEIGHT_FLOOR: float = 0.001

Span = tuple[float, float]

TARGET_CHILD: dict[str, str] = {
    "DEF-hips": "DEF-spine.001",
    "DEF-spine.001": "DEF-spine.002",
    "DEF-spine.002": "DEF-spine.003",
    "DEF-spine.003": "DEF-neck",
    "DEF-neck": "DEF-head",
}
for side, _ in SIDES:
    TARGET_CHILD[f"DEF-shoulder.{side}"] = f"DEF-upper_arm.{side}"
    TARGET_CHILD[f"DEF-upper_arm.{side}"] = f"DEF-forearm.{side}"
    TARGET_CHILD[f"DEF-forearm.{side}"] = f"DEF-hand.{side}"
    TARGET_CHILD[f"DEF-hand.{side}"] = f"DEF-f_middle.01.{side}"
    TARGET_CHILD[f"DEF-thigh.{side}"] = f"DEF-shin.{side}"
    TARGET_CHILD[f"DEF-shin.{side}"] = f"DEF-foot.{side}"
    TARGET_CHILD[f"DEF-foot.{side}"] = f"DEF-toe.{side}"
    for finger in (*(f"f_{name}" for name in FINGERS), "thumb"):
        TARGET_CHILD[f"DEF-{finger}.01.{side}"] = f"DEF-{finger}.02.{side}"
        TARGET_CHILD[f"DEF-{finger}.02.{side}"] = f"DEF-{finger}.03.{side}"


@dataclass(frozen=True)
class SourceSkeleton:
    joints: dict[str, str]
    child: dict[str, str]
    rides: dict[str, str]


def unreal_skeleton() -> SourceSkeleton:
    joints: dict[str, str] = {
        "pelvis": "DEF-hips",
        "spine_01": "DEF-spine.001",
        "spine_02": "DEF-spine.002",
        "spine_03": "DEF-spine.003",
        "neck_01": "DEF-neck",
        "head": "DEF-head",
    }
    child: dict[str, str] = {"pelvis": "spine_01", "spine_01": "spine_02", "spine_02": "spine_03", "spine_03": "neck_01", "neck_01": "head"}
    rides: dict[str, str] = {}
    for side, low in SIDES:
        joints[f"clavicle_{low}"] = f"DEF-shoulder.{side}"
        joints[f"upperarm_{low}"] = f"DEF-upper_arm.{side}"
        joints[f"lowerarm_{low}"] = f"DEF-forearm.{side}"
        joints[f"hand_{low}"] = f"DEF-hand.{side}"
        joints[f"thigh_{low}"] = f"DEF-thigh.{side}"
        joints[f"calf_{low}"] = f"DEF-shin.{side}"
        joints[f"foot_{low}"] = f"DEF-foot.{side}"
        joints[f"ball_{low}"] = f"DEF-toe.{side}"
        joints[f"ball_leaf_{low}"] = f"DEF-toe.{side}"
        rides[f"ball_leaf_{low}"] = f"ball_{low}"
        child[f"clavicle_{low}"] = f"upperarm_{low}"
        child[f"upperarm_{low}"] = f"lowerarm_{low}"
        child[f"lowerarm_{low}"] = f"hand_{low}"
        child[f"hand_{low}"] = f"middle_01_{low}"
        child[f"thigh_{low}"] = f"calf_{low}"
        child[f"calf_{low}"] = f"foot_{low}"
        child[f"foot_{low}"] = f"ball_{low}"
        for finger in (*FINGERS, "thumb"):
            target: str = f"DEF-thumb" if finger == "thumb" else f"DEF-f_{finger}"
            for index in (1, 2, 3):
                joints[f"{finger}_0{index}_{low}"] = f"{target}.0{index}.{side}"
            joints[f"{finger}_04_leaf_{low}"] = f"{target}.03.{side}"
            rides[f"{finger}_04_leaf_{low}"] = f"{finger}_03_{low}"
            child[f"{finger}_01_{low}"] = f"{finger}_02_{low}"
            child[f"{finger}_02_{low}"] = f"{finger}_03_{low}"
    return SourceSkeleton(joints, child, rides)


SKELETONS: dict[str, SourceSkeleton] = {"unreal": unreal_skeleton()}


def trim_faces(obj: Object, label: str, drop_materials: tuple[str, ...], clip: Span | None) -> None:
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    slots: list[str] = [made.name.split(".")[0] if made is not None else "" for made in obj.data.materials]
    doomed = [face for face in mesh.faces if face.material_index < len(slots) and slots[face.material_index] in drop_materials]
    bmesh.ops.delete(mesh, geom=doomed, context="FACES")
    if clip is not None:
        near, far = clip
        for edge in (near, far):
            for sign in (1.0, -1.0):
                if edge <= 0.0:
                    continue
                bmesh.ops.bisect_plane(mesh, geom=[*mesh.verts, *mesh.edges, *mesh.faces], plane_co=(sign * edge, 0.0, 0.0), plane_no=(1.0, 0.0, 0.0), dist=1e-6)
        outside = [face for face in mesh.faces if not near <= abs(face.calc_center_median().x) <= far]
        bmesh.ops.delete(mesh, geom=outside, context="FACES")
    loose = [vert for vert in mesh.verts if not vert.link_faces]
    bmesh.ops.delete(mesh, geom=loose, context="VERTS")
    mesh.to_mesh(obj.data)
    mesh.free()
    if len(obj.data.polygons) == 0:
        raise RuntimeError(f"{label}: nothing left after trimming")


def bone_matrix(skeleton: SourceSkeleton, joint: str, source: dict[str, Vector], target: dict[str, Vector], girth: float) -> Matrix:
    name: str = skeleton.rides.get(joint, joint)
    mapped: str = skeleton.joints[name]
    from_head: Vector = source[name]
    to_head: Vector = target[mapped]
    source_child: str | None = skeleton.child.get(name)
    target_child: str | None = TARGET_CHILD.get(mapped)
    if source_child is None or target_child is None or source_child not in source or skeleton.joints.get(source_child) != target_child:
        return Matrix.Translation(to_head) @ Matrix.Scale(girth, 4) @ Matrix.Translation(-from_head)
    from_axis: Vector = source[source_child] - from_head
    to_axis: Vector = target[target_child] - to_head
    unit: Vector = from_axis.normalized()
    stretch: float = to_axis.length / from_axis.length
    along: Matrix = girth * Matrix.Identity(3) + (stretch - girth) * Matrix([[unit[row] * unit[column] for column in range(3)] for row in range(3)])
    turn: Matrix = from_axis.rotation_difference(to_axis).to_matrix()
    return Matrix.Translation(to_head) @ (turn @ along).to_4x4() @ Matrix.Translation(-from_head)


def lowered(names: dict[str, Vector]) -> dict[str, Vector]:
    return {name.lower(): head for name, head in names.items()}


def refit(obj: Object, skeleton: SourceSkeleton, source: dict[str, Vector], target: dict[str, Vector], girth: float) -> None:
    mesh = obj.data
    count: int = len(mesh.vertices)
    joints: list[str] = sorted(set(skeleton.joints.values()))
    column: dict[str, int] = {name: index for index, name in enumerate(joints)}
    weights = np.zeros((count, len(joints)), dtype=np.float64)
    moved = np.zeros((count, 3), dtype=np.float64)
    total = np.zeros(count, dtype=np.float64)
    heads: dict[str, Vector] = lowered(source)
    matrices: dict[int, np.ndarray] = {}
    names: dict[int, str] = {}
    for group in obj.vertex_groups:
        key: str = group.name.lower()
        if key in skeleton.joints and key in heads:
            names[group.index] = key
            matrices[group.index] = np.array(bone_matrix(skeleton, key, heads, target, girth))
    points = np.empty(count * 3, dtype=np.float64)
    mesh.vertices.foreach_get("co", points)
    points = np.concatenate([points.reshape(count, 3), np.ones((count, 1))], axis=1)
    for vertex in mesh.vertices:
        for entry in vertex.groups:
            matrix = matrices.get(entry.group)
            if matrix is None or entry.weight <= 0.0:
                continue
            moved[vertex.index] += entry.weight * (matrix @ points[vertex.index])[:3]
            total[vertex.index] += entry.weight
            weights[vertex.index, column[skeleton.joints[names[entry.group]]]] += entry.weight
    if np.any(total <= 0.0):
        raise RuntimeError(f"{obj.name}: {int(np.sum(total <= 0.0))} vertices have no weight on a mapped joint")
    moved /= total[:, None]
    mesh.vertices.foreach_set("co", moved.reshape(-1))
    keep = np.argsort(-weights, axis=1)[:, :MAX_INFLUENCES]
    limited = np.zeros_like(weights)
    rows = np.arange(count)[:, None]
    limited[rows, keep] = weights[rows, keep]
    limited[limited < WEIGHT_FLOOR] = 0.0
    limited /= limited.sum(axis=1)[:, None]
    obj.vertex_groups.clear()
    for name in joints:
        index: int = column[name]
        used = np.nonzero(limited[:, index])[0]
        if len(used) == 0:
            continue
        group = obj.vertex_groups.new(name=name)
        for vertex in used:
            group.add([int(vertex)], float(limited[vertex, index]), "REPLACE")
    mesh.update()


def keep_below(obj: Object, label: str, top: float | None) -> None:
    if top is None:
        return
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    bmesh.ops.bisect_plane(mesh, geom=[*mesh.verts, *mesh.edges, *mesh.faces], plane_co=(0.0, 0.0, top), plane_no=(0.0, 0.0, 1.0), dist=1e-6)
    above = [face for face in mesh.faces if face.calc_center_median().z > top]
    bmesh.ops.delete(mesh, geom=above, context="FACES")
    loose = [vert for vert in mesh.verts if not vert.link_faces]
    bmesh.ops.delete(mesh, geom=loose, context="VERTS")
    mesh.to_mesh(obj.data)
    mesh.free()
    if len(obj.data.polygons) == 0:
        raise RuntimeError(f"{label}: nothing left below {top}")


def inflate(obj: Object, distance: float) -> None:
    if distance == 0.0:
        return
    for vertex in obj.data.vertices:
        vertex.co = vertex.co + vertex.normal * distance
    obj.data.update()


def simplify(obj: Object, ratio: float) -> None:
    if ratio >= 1.0:
        return
    modifier = obj.modifiers.new("decimate", "DECIMATE")
    modifier.ratio = ratio
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
