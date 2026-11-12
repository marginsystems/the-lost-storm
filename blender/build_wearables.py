import json
import sys
from dataclasses import dataclass
from pathlib import Path

import bpy
from bpy.types import Image, Object
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))

from wearable_fit import SKELETONS, SourceSkeleton, Span, inflate, keep_below, refit, simplify, trim_faces
from wearable_makehuman import Garment
from wearable_makehuman import load as load_makehuman
from wearable_makehuman import load_body
from wearable_makehuman import skeleton as makehuman_skeleton
from wearable_textures import retexture, source_images

WEBP_QUALITY: int = 88
MAKEHUMAN: str = "makehuman"
EYE_TEXTURE_SIZE: int = 128
EYE_SUFFIX: str = "_eyes"

Shape = tuple[tuple[str, float], ...]


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
    girth: float | None
    shift: tuple[float, float, float]
    body: bool
    eyes: str | None
    shape: Shape
    desaturate: float
    luma: float | None
    cutout: bool
    keep_below: float | None


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
        girth=None if raw.get("girth") is None else float(raw["girth"]),
        shift=tuple(float(value) for value in raw.get("shift", (0.0, 0.0, 0.0))),
        body=bool(raw.get("body", False)),
        eyes=None if raw.get("eyes") is None else str(raw["eyes"]),
        shape=tuple((str(entry[0]), float(entry[1])) for entry in raw.get("shape", [])),
        desaturate=float(raw.get("desaturate", 0.0)),
        luma=None if raw.get("luma") is None else float(raw["luma"]),
        cutout=bool(raw.get("cutout", False)),
        keep_below=None if raw.get("keepBelow") is None else float(raw["keepBelow"]),
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


def export(objects: list[Object], rig: Object, path: Path) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
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


@dataclass(frozen=True)
class Pack:
    root: Path
    skeleton: str
    rig_root: Path | None
    girth: float


@dataclass
class Source:
    obj: Object
    heads: dict[str, Vector]
    images: dict[str, Image]
    skeleton: SourceSkeleton
    leftovers: list[str]
    size: int
    name: str


def load_rigged(part: Part, pack: Pack) -> list[Source]:
    imported: list[Object] = import_model(pack.root / part.file)
    names: list[str] = [entry.name for entry in imported]
    armature: Object = only_armature(imported, part.id)
    picked: list[tuple[Object, Span | None]] = pick_meshes(imported, armature, part)
    for mesh_object, clip in picked:
        trim_faces(mesh_object, part.id, part.drop_materials, clip)
    obj: Object = join_meshes([mesh_object for mesh_object, _ in picked])
    return [Source(obj, joint_heads(armature), source_images(obj, part.drop_materials), SKELETONS[pack.skeleton], names, part.texture_size, part.id)]


def load_garment(part: Part, pack: Pack) -> list[Source]:
    if pack.rig_root is None:
        raise RuntimeError(f"{part.id}: pack {part.pack} names no rig pack, or that pack has no folder on the command line")
    if not part.body:
        garment: Garment = load_makehuman(part.id, pack.root / part.file, pack.rig_root, part.shape)
        trim_faces(garment.obj, part.id, (), part.keep_abs_x)
        return [Source(garment.obj, garment.heads, garment.images, makehuman_skeleton(), [], part.texture_size, part.id)]
    body: Garment = load_body(part.id, pack.root / part.file, pack.rig_root, part.shape)
    trim_faces(body.obj, part.id, (), None)
    made: list[Source] = [Source(body.obj, body.heads, body.images, makehuman_skeleton(), [], part.texture_size, part.id)]
    if part.eyes is not None:
        name: str = f"{part.id}{EYE_SUFFIX}"
        eyes: Garment = load_makehuman(name, pack.root / part.eyes, pack.rig_root, part.shape)
        made.append(Source(eyes.obj, eyes.heads, eyes.images, makehuman_skeleton(), [], EYE_TEXTURE_SIZE, name))
    return made


def build_part(part: Part, pack: Pack, rig_path: Path, out: Path, scratch: Path) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rig_objects: list[Object] = import_model(rig_path)
    rig: Object = only_armature(rig_objects, "rig")
    for extra in rig_objects:
        if extra != rig:
            bpy.data.objects.remove(extra)
    target: dict[str, Vector] = joint_heads(rig)
    sources: list[Source] = load_garment(part, pack) if pack.skeleton == MAKEHUMAN else load_rigged(part, pack)
    for source in sources:
        refit(source.obj, source.skeleton, source.heads, target, pack.girth if part.girth is None else part.girth)
        source.obj.data.transform(Matrix.Translation(part.shift))
        keep_below(source.obj, source.name, part.keep_below if source.name == part.id else None)
        inflate(source.obj, part.inflate)
        simplify(source.obj, part.decimate if source.name == part.id else 1.0)
        retexture(source.obj, source.name, source.size, source.images, scratch, part.desaturate, part.luma if source.name == part.id else None, part.cutout and source.name == part.id)
        bind(source.obj, rig, source.name)
        for name in source.leftovers:
            leftover: Object | None = bpy.data.objects.get(name)
            if leftover is not None and leftover != source.obj:
                bpy.data.objects.remove(leftover)
    obj: Object = sources[0].obj
    path: Path = out / f"{part.id}.glb"
    export([source.obj for source in sources], rig, path)
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
    parts: list[Part] = [read_part(raw) for raw in manifest["parts"]]
    strangers: list[str] = sorted(set(roots) - set(manifest["packs"]))
    if strangers:
        raise SystemExit(f"the manifest has no pack called {', '.join(strangers)}")
    unknown: list[str] = sorted((only or set()) - {part.id for part in parts})
    if unknown:
        raise SystemExit(f"only= names parts that are not in the manifest: {', '.join(unknown)}")
    wanted: list[Part] = [part for part in parts if only is None or part.id in only]
    homeless: list[str] = sorted({part.pack for part in wanted if part.pack not in roots})
    if only is not None and homeless:
        raise SystemExit(f"only= names parts of {', '.join(homeless)}, which has no <pack>=<dir> argument")
    buildable: list[Part] = [part for part in wanted if part.pack in roots]
    if not buildable:
        raise SystemExit("nothing to build: give a <pack>=<dir> argument for a pack in the manifest")
    for part in buildable:
        described = manifest["packs"][part.pack]
        pack: Pack = Pack(roots[part.pack], str(described["skeleton"]), roots.get(str(described.get("rig", ""))), float(described.get("girth", 1.0)))
        build_part(part, pack, rig_path, out, scratch)


build(sys.argv[sys.argv.index("--") + 1 :])
