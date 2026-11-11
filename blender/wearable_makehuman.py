import json
from dataclasses import dataclass
from pathlib import Path

import bpy
import numpy as np
from bpy.types import Image, Object
from mathutils import Vector

from wearable_fit import FINGERS, SIDES, TARGET_CHILD, SourceSkeleton

DECIMETRE: float = 0.1
BASE_MESH: str = "base.obj"
SKELETON: str = "default.mhskel"
WEIGHTS: str = "default_weights.mhw"
THUMB: str = "finger1"
FINGER_NUMBER: dict[str, int] = {"index": 2, "middle": 3, "ring": 4, "pinky": 5}
BALL_OF_FOOT: str = "toe3-1"
MIN_WEIGHT: float = 0.0005
AXIS_SCALES: tuple[str, str, str] = ("x_scale", "y_scale", "z_scale")
BOUND_TO: int = 3
SEGMENTS: tuple[str, ...] = ("1", "2", "3")
HEAD_BONES: frozenset[str] = frozenset({"head", "neck", "jaw", "eye", "tongue", "oris", "levator", "oculi", "orbicularis", "risorius", "special", "temporalis"})

CENTRE: dict[str, str] = {
    "root": "DEF-hips",
    "spine05": "DEF-hips",
    "spine04": "DEF-hips",
    "spine03": "DEF-spine.001",
    "spine02": "DEF-spine.002",
    "spine01": "DEF-spine.003",
    "neck01": "DEF-neck",
}
SIDED: dict[str, str] = {
    "pelvis": "DEF-hips",
    "breast": "DEF-spine.003",
    "clavicle": "DEF-shoulder",
    "shoulder01": "DEF-shoulder",
    "upperarm01": "DEF-upper_arm",
    "upperarm02": "DEF-upper_arm",
    "lowerarm01": "DEF-forearm",
    "lowerarm02": "DEF-forearm",
    "wrist": "DEF-hand",
    "upperleg01": "DEF-thigh",
    "upperleg02": "DEF-thigh",
    "lowerleg01": "DEF-shin",
    "lowerleg02": "DEF-shin",
    "foot": "DEF-foot",
}
JOINT_AT: dict[str, str] = {
    "DEF-hips": "spine05",
    "DEF-spine.001": "spine03",
    "DEF-spine.002": "spine02",
    "DEF-spine.003": "spine01",
    "DEF-neck": "neck01",
    "DEF-head": "neck02",
}
for side, _ in SIDES:
    JOINT_AT[f"DEF-shoulder.{side}"] = f"clavicle.{side}"
    JOINT_AT[f"DEF-upper_arm.{side}"] = f"upperarm01.{side}"
    JOINT_AT[f"DEF-forearm.{side}"] = f"lowerarm01.{side}"
    JOINT_AT[f"DEF-hand.{side}"] = f"wrist.{side}"
    JOINT_AT[f"DEF-thigh.{side}"] = f"upperleg01.{side}"
    JOINT_AT[f"DEF-shin.{side}"] = f"lowerleg01.{side}"
    JOINT_AT[f"DEF-foot.{side}"] = f"foot.{side}"
    JOINT_AT[f"DEF-toe.{side}"] = f"{BALL_OF_FOOT}.{side}"
    for segment in (1, 2, 3):
        JOINT_AT[f"DEF-thumb.0{segment}.{side}"] = f"{THUMB}-{segment}.{side}"
        for finger in FINGERS:
            JOINT_AT[f"DEF-f_{finger}.0{segment}.{side}"] = f"finger{FINGER_NUMBER[finger]}-{segment}.{side}"


@dataclass
class Garment:
    obj: Object
    heads: dict[str, Vector]
    images: dict[str, Image]


@dataclass(frozen=True)
class Clothes:
    mesh: str
    material: str
    bound: np.ndarray
    share: np.ndarray
    offset: np.ndarray
    scale: dict[str, tuple[int, int, float]]


def skeleton() -> SourceSkeleton:
    return SourceSkeleton(
        {name.lower(): name for name in JOINT_AT},
        {parent.lower(): child.lower() for parent, child in TARGET_CHILD.items()},
        {},
    )


def joint_of(bone: str) -> str:
    stem, dot, side = bone.rpartition(".")
    if dot == "" or side not in ("L", "R"):
        stem, side = bone, ""
    plain: str = stem.rstrip("0123456789")
    if side == "" and stem in CENTRE:
        return CENTRE[stem]
    if plain in HEAD_BONES:
        return "DEF-head"
    if side == "":
        raise RuntimeError(f"no joint is mapped for the MakeHuman bone {bone}")
    if stem in SIDED:
        target: str = SIDED[stem]
        return target if target in ("DEF-hips", "DEF-spine.003") else f"{target}.{side}"
    if plain == "metacarpal":
        return f"DEF-hand.{side}"
    finger, dash, segment = stem.partition("-")
    if dash == "-" and finger.rstrip("0123456789") == "toe":
        return f"DEF-toe.{side}"
    if dash == "-" and finger == THUMB and segment in SEGMENTS:
        return f"DEF-thumb.0{segment}.{side}"
    for name, number in FINGER_NUMBER.items():
        if dash == "-" and finger == f"finger{number}" and segment in SEGMENTS:
            return f"DEF-f_{name}.0{segment}.{side}"
    raise RuntimeError(f"no joint is mapped for the MakeHuman bone {bone}")


def upright(points: np.ndarray) -> np.ndarray:
    return np.stack([points[:, 0], -points[:, 2], points[:, 1]], axis=1) * DECIMETRE


def read_points(path: Path) -> np.ndarray:
    rows: list[list[float]] = [[float(value) for value in line.split()[1:4]] for line in path.read_text().splitlines() if line.startswith("v ")]
    return np.array(rows, dtype=np.float64)


def read_clothes(path: Path) -> Clothes:
    mesh: str = ""
    material: str = ""
    bound: list[list[int]] = []
    share: list[list[float]] = []
    offset: list[list[float]] = []
    scale: dict[str, tuple[int, int, float]] = {}
    reading: bool = False
    for line in path.read_text().splitlines():
        words: list[str] = line.split()
        if not words or words[0].startswith("#"):
            continue
        if words[0] == "obj_file":
            mesh = words[1]
        elif words[0] == "material":
            material = words[1]
        elif words[0] in AXIS_SCALES and len(words) == 4:
            scale[words[0]] = (int(words[1]), int(words[2]), float(words[3]))
        elif words[0] == "verts":
            reading = True
        elif reading and len(words) == 3 * BOUND_TO:
            bound.append([int(word) for word in words[:BOUND_TO]])
            share.append([float(word) for word in words[BOUND_TO : 2 * BOUND_TO]])
            offset.append([float(word) for word in words[2 * BOUND_TO :]])
        elif reading and len(words) == 1 and words[0].isdigit():
            bound.append([int(words[0])] * BOUND_TO)
            share.append([1.0, 0.0, 0.0])
            offset.append([0.0, 0.0, 0.0])
        elif reading:
            reading = False
    if mesh == "" or not bound:
        raise RuntimeError(f"{path.name}: no obj_file or no vertex bindings")
    return Clothes(mesh, material, np.array(bound, dtype=np.int64), np.array(share, dtype=np.float64), np.array(offset, dtype=np.float64), scale)


def fitted_points(clothes: Clothes, base: np.ndarray) -> np.ndarray:
    stretch = np.ones(3, dtype=np.float64)
    for axis, key in enumerate(AXIS_SCALES):
        if key in clothes.scale:
            first, second, span = clothes.scale[key]
            stretch[axis] = abs(base[first, axis] - base[second, axis]) / span
    return np.einsum("vk,vkc->vc", clothes.share, base[clothes.bound]) + clothes.offset * stretch


def read_textures(path: Path) -> dict[str, Path]:
    found: dict[str, Path] = {}
    keys: dict[str, str] = {"diffuseTexture": "color", "normalmapTexture": "normal"}
    for line in path.read_text().splitlines():
        words: list[str] = line.split()
        if len(words) >= 2 and words[0] in keys:
            found[keys[words[0]]] = path.parent / Path(words[1]).name
    if "color" not in found:
        raise RuntimeError(f"{path.name}: no diffuse texture")
    return found


def base_weights(rig_root: Path, joints: list[str], count: int) -> np.ndarray:
    column: dict[str, int] = {name: index for index, name in enumerate(joints)}
    weights = np.zeros((count, len(joints)), dtype=np.float64)
    for bone, pairs in json.loads((rig_root / WEIGHTS).read_text())["weights"].items():
        index: int = column[joint_of(bone)]
        for vertex, weight in pairs:
            weights[int(vertex), index] += float(weight)
    return weights


def joint_heads(rig_root: Path, base: np.ndarray) -> dict[str, Vector]:
    rig = json.loads((rig_root / SKELETON).read_text())
    heads: dict[str, Vector] = {}
    for joint, bone in JOINT_AT.items():
        marker: list[int] = rig["joints"][rig["bones"][bone]["head"]]
        heads[joint.lower()] = Vector(upright(base[marker])[:].mean(axis=0))
    return heads


def build_mesh(name: str, path: Path, points: np.ndarray) -> Object:
    coordinates: list[tuple[float, float]] = []
    faces: list[list[int]] = []
    corners: list[list[int]] = []
    for line in path.read_text().splitlines():
        words: list[str] = line.split()
        if not words:
            continue
        if words[0] == "vt":
            coordinates.append((float(words[1]), float(words[2])))
        elif words[0] == "f":
            pairs: list[list[str]] = [word.split("/") for word in words[1:]]
            face: list[int] = [int(pair[0]) - 1 for pair in pairs]
            if len(set(face)) != len(face):
                continue
            faces.append(face)
            corners.append([int(pair[1]) - 1 if len(pair) > 1 and pair[1] != "" else -1 for pair in pairs])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(point) for point in points], [], faces)
    layer = mesh.uv_layers.new(name="UVMap")
    for polygon, face_corners in zip(mesh.polygons, corners):
        for loop, corner in zip(polygon.loop_indices, face_corners):
            if corner >= 0:
                layer.data[loop].uv = coordinates[corner]
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.update()
    obj: Object = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def load(name: str, clothes_path: Path, rig_root: Path) -> Garment:
    clothes: Clothes = read_clothes(clothes_path)
    base: np.ndarray = read_points(rig_root / BASE_MESH)
    joints: list[str] = sorted(JOINT_AT)
    skin: np.ndarray = np.einsum("vk,vkj->vj", clothes.share, base_weights(rig_root, joints, len(base))[clothes.bound])
    count: int = len(read_points(clothes_path.parent / clothes.mesh))
    if count != len(skin):
        raise RuntimeError(f"{clothes_path.name} binds {len(skin)} vertices but {clothes.mesh} has {count}")
    obj: Object = build_mesh(name, clothes_path.parent / clothes.mesh, upright(fitted_points(clothes, base)))
    for index, joint in enumerate(joints):
        used = np.nonzero(skin[:, index] > MIN_WEIGHT)[0]
        if len(used) == 0:
            continue
        group = obj.vertex_groups.new(name=joint)
        for vertex in used:
            group.add([int(vertex)], float(skin[vertex, index]), "REPLACE")
    textures: dict[str, Path] = read_textures(clothes_path.parent / clothes.material)
    images: dict[str, Image] = {key: bpy.data.images.load(str(path)) for key, path in textures.items()}
    images["color"].colorspace_settings.name = "sRGB"
    if "normal" in images:
        images["normal"].colorspace_settings.name = "Non-Color"
    return Garment(obj, joint_heads(rig_root, base), images)
