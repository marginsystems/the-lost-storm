import json
import sys
from dataclasses import dataclass
from pathlib import Path

import bpy
from bpy.types import Image, Object
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))

from wearable_fit import SKELETONS, SourceSkeleton, Span, inflate, refit, simplify, trim_faces
from wearable_textures import retexture, source_images

WEBP_QUALITY: int = 88


@dataclass(frozen=True)
class SourceObject:
    name: str
    keep_abs_x: Span | None


@dataclass(frozen=True)
class Part:
    id: str
    pack: str
    file: str
    objects: tuple[SourceObject, ...]
    drop_materials: tuple[str, ...]
    keep_abs_x: Span | None
    decimate: float
    texture_size: int
    inflate: float


def read_span(raw: object) -> Span | None:
    return None if raw is None else (float(raw[0]), float(raw[1]))


def read_object(raw: object, fallback: Span | None) -> SourceObject:
    if isinstance(raw, str):
        return SourceObject(raw, fallback)
    return SourceObject(str(raw["name"]), read_span(raw.get("keepAbsX")) or fallback)


def read_part(raw: dict[str, object]) -> Part:
    clip: Span | None = read_span(raw.get("keepAbsX"))
    return Part(
        id=str(raw["id"]),
        pack=str(raw["pack"]),
        file=str(raw["file"]),
        objects=tuple(read_object(entry, clip) for entry in raw.get("objects", [])),
        drop_materials=tuple(str(name) for name in raw.get("dropMaterials", [])),
        keep_abs_x=clip,
        decimate=float(raw.get("decimate", 1.0)),
        texture_size=int(raw.get("textureSize", 512)),
        inflate=float(raw.get("inflate", 0.0)),
    )


def import_model(path: Path) -> list[Object]:
    before: set[str] = {obj.name for obj in bpy.data.objects}
    if path.suffix.lower() == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(path))
    else:
        bpy.ops.import_scene.gltf(filepath=str(path))
    return [obj for obj in bpy.data.objects if obj.name not in before]


def joint_heads(armature: Object) -> dict[str, Vector]:
    return {bone.name: armature.matrix_world @ bone.head_local for bone in armature.data.bones}


def only_armature(objects: list[Object], what: str) -> Object:
    found: list[Object] = [obj for obj in objects if obj.type == "ARMATURE"]
    if len(found) != 1:
        raise RuntimeError(f"{what}: expected one armature, found {len(found)}")
    return found[0]


def pick_meshes(objects: list[Object], armature: Object, part: Part) -> list[tuple[Object, Span | None]]:
    skinned: list[Object] = [obj for obj in objects if obj.type == "MESH" and obj.parent == armature]
    if not part.objects:
        picked: list[tuple[Object, Span | None]] = [(obj, part.keep_abs_x) for obj in skinned]
    else:
        by_name: dict[str, Object] = {obj.name: obj for obj in skinned}
        missing: list[str] = [wanted.name for wanted in part.objects if wanted.name not in by_name]
        if missing:
            raise RuntimeError(f"{part.id}: the source file has no skinned mesh named {missing}")
        picked = [(by_name[wanted.name], wanted.keep_abs_x) for wanted in part.objects]
    if not picked:
        raise RuntimeError(f"{part.id}: no skinned mesh in the source file")
    return picked


def join_meshes(meshes: list[Object]) -> Object:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    joined: Object = meshes[0]
    joined.data.transform(joined.matrix_world)
    joined.matrix_world = Matrix.Identity(4)
    return joined


def bind(obj: Object, rig: Object, name: str) -> None:
    obj.name = name
    obj.data.name = name
    for modifier in list(obj.modifiers):
        obj.modifiers.remove(modifier)
    obj.parent = rig
    obj.matrix_parent_inverse = Matrix.Identity(4)
    modifier = obj.modifiers.new("Armature", "ARMATURE")
    modifier.object = rig


def export(obj: Object, rig: Object, path: Path) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_animations=False,
        export_skins=True,
        export_yup=True,
        export_apply=False,
        export_tangents=False,
        export_vertex_color="NONE",
        export_image_format="WEBP",
        export_image_quality=WEBP_QUALITY,
    )


def build_part(part: Part, source_root: Path, skeleton: SourceSkeleton, rig_path: Path, out: Path, scratch: Path) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rig_objects: list[Object] = import_model(rig_path)
    rig: Object = only_armature(rig_objects, "rig")
    for extra in rig_objects:
        if extra != rig:
            bpy.data.objects.remove(extra)
    target: dict[str, Vector] = joint_heads(rig)
    imported: list[Object] = import_model(source_root / part.file)
    imported_names: list[str] = [entry.name for entry in imported]
    armature: Object = only_armature(imported, part.id)
    picked: list[tuple[Object, Span | None]] = pick_meshes(imported, armature, part)
    for mesh_object, clip in picked:
        trim_faces(mesh_object, part.id, part.drop_materials, clip)
    obj: Object = join_meshes([mesh_object for mesh_object, _ in picked])
    images: dict[str, Image] = source_images(obj, part.drop_materials)
    refit(obj, skeleton, joint_heads(armature), target)
    inflate(obj, part.inflate)
    simplify(obj, part.decimate)
    retexture(obj, part.id, part.texture_size, images, scratch)
    bind(obj, rig, part.id)
    for name in imported_names:
        leftover: Object | None = bpy.data.objects.get(name)
        if leftover is not None and leftover != obj:
            bpy.data.objects.remove(leftover)
    path: Path = out / f"{part.id}.glb"
    export(obj, rig, path)
    triangles: int = sum(len(polygon.vertices) - 2 for polygon in obj.data.polygons)
    print(f"WEARABLE {part.id} vertices={len(obj.data.vertices)} triangles={triangles} bytes={path.stat().st_size}")


def build(arguments: list[str]) -> None:
    if len(arguments) < 5:
        raise SystemExit("usage: blender -b --python blender/build_wearables.py -- <manifest.json> <rig.glb> <out-dir> <scratch-dir> <pack>=<dir>... [only=<id>,<id>]")
    manifest = json.loads(Path(arguments[0]).read_text())
    rig_path: Path = Path(arguments[1])
    out: Path = Path(arguments[2])
    scratch: Path = Path(arguments[3])
    out.mkdir(parents=True, exist_ok=True)
    scratch.mkdir(parents=True, exist_ok=True)
    roots: dict[str, Path] = {}
    only: set[str] | None = None
    for argument in arguments[4:]:
        key, _, value = argument.partition("=")
        if key == "only":
            only = set(value.split(","))
        else:
            roots[key] = Path(value)
    for raw in manifest["parts"]:
        part: Part = read_part(raw)
        if part.pack not in roots or (only is not None and part.id not in only):
            continue
        skeleton: SourceSkeleton = SKELETONS[str(manifest["packs"][part.pack]["skeleton"])]
        build_part(part, roots[part.pack], skeleton, rig_path, out, scratch)


build(sys.argv[sys.argv.index("--") + 1 :])
