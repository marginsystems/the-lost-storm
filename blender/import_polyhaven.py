import json
import math
import sys
from typing import Any

import bmesh
import bpy
import numpy
from bpy.types import Image, Material, NodeTree, Object

WEBP_QUALITY: int = 80
DEFAULT_TEXTURE_SIZE: int = 512
MIN_TEXTURE_SIZE: int = 64
DECIMATE_MIN_RATIO: float = 0.005
WELD_DISTANCE: float = 0.00001
SMOOTH_ANGLE_DEGREES: float = 45.0
DECIMATE_ITERATIONS: int = 6
DECIMATE_OVERSHOOT: float = 0.95
ARGUMENT_SEPARATOR: str = "--"
RGBA_CHANNELS: int = 4
METAL_EPSILON: float = 0.0001
OCCLUSION_GROUP: str = "glTF Material Output"
ARM_MARKER: str = "_arm"
GLASS_ALPHA: float = 0.3
ONLY_PREFIX: str = "only="


def triangle_count(obj: Object) -> int:
    return sum(len(polygon.vertices) - 2 for polygon in obj.data.polygons)


def clear_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_asset(directory: str, asset: str) -> list[Object]:
    bpy.ops.import_scene.gltf(filepath=f"{directory}/{asset}/{asset}_1k.gltf")
    return list(bpy.context.scene.objects)


def select_only(objects: list[Object]) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def wanted_meshes(entry: dict[str, Any], objects: list[Object]) -> list[Object]:
    keep: list[str] = entry.get("keep", [])
    drop: list[str] = entry.get("drop", [])
    meshes: list[Object] = [obj for obj in objects if obj.type == "MESH"]
    if keep:
        meshes = [obj for obj in meshes if obj.name in keep]
    meshes = [obj for obj in meshes if obj.name not in drop]
    for obj in objects:
        if obj not in meshes:
            bpy.data.objects.remove(obj, do_unlink=True)
    return meshes


def join_and_bake_transforms(meshes: list[Object], name: str) -> Object:
    select_only(meshes)
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.make_single_user(object=True, obdata=True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(meshes) > 1:
        bpy.ops.object.join()
    joined: Object = bpy.context.view_layer.objects.active
    joined.name = name
    joined.data.name = name
    return joined


def rotate(obj: Object, degrees: list[float]) -> None:
    if not any(degrees):
        return
    obj.rotation_mode = "XYZ"
    obj.rotation_euler = (math.radians(degrees[0]), math.radians(degrees[1]), math.radians(degrees[2]))
    select_only([obj])
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)


def weld(obj: Object) -> None:
    select_only([obj])
    bpy.ops.mesh.customdata_custom_splitnormals_clear()
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    bmesh.ops.remove_doubles(mesh, verts=mesh.verts, dist=WELD_DISTANCE)
    mesh.to_mesh(obj.data)
    mesh.free()


def decimate(obj: Object, limit: int) -> None:
    if triangle_count(obj) <= limit:
        return
    weld(obj)
    for _ in range(DECIMATE_ITERATIONS):
        current: int = triangle_count(obj)
        if current <= limit:
            break
        modifier = obj.modifiers.new("decimate", "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = max(DECIMATE_MIN_RATIO, limit / current * DECIMATE_OVERSHOOT)
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    select_only([obj])
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(SMOOTH_ANGLE_DEGREES))


def ground(obj: Object) -> None:
    corners = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    low: float = min(corner.z for corner in corners)
    centre_x: float = (min(corner.x for corner in corners) + max(corner.x for corner in corners)) / 2.0
    centre_y: float = (min(corner.y for corner in corners) + max(corner.y for corner in corners)) / 2.0
    for vertex in obj.data.vertices:
        vertex.co.x -= centre_x
        vertex.co.y -= centre_y
        vertex.co.z -= low
    obj.data.update()


def material_images(obj: Object) -> list[Image]:
    found: list[Image] = []
    for slot in obj.material_slots:
        made: Material | None = slot.material
        if made is None or made.node_tree is None:
            continue
        for node in made.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image is not None and node.image not in found:
                found.append(node.image)
    return found


def roughness_only_copy(image: Image) -> Image:
    width, height = image.size
    pixels = numpy.empty(width * height * RGBA_CHANNELS, dtype=numpy.float32)
    image.pixels.foreach_get(pixels)
    pixels = pixels.reshape(-1, RGBA_CHANNELS)
    pixels[:, 0] = 1.0
    pixels[:, 2] = 0.0
    pixels[:, 3] = 1.0
    copy: Image = bpy.data.images.new(image.name + "_orm", width, height, alpha=False)
    copy.colorspace_settings.name = image.colorspace_settings.name
    copy.pixels.foreach_set(pixels.ravel())
    return copy


def occlusion_group() -> NodeTree:
    existing: NodeTree | None = bpy.data.node_groups.get(OCCLUSION_GROUP)
    if existing is not None:
        return existing
    group: NodeTree = bpy.data.node_groups.new(OCCLUSION_GROUP, "ShaderNodeTree")
    group.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    return group


def wire_occlusion(obj: Object) -> None:
    for slot in obj.material_slots:
        if slot.material is None or slot.material.node_tree is None:
            continue
        tree = slot.material.node_tree
        for node in tree.nodes:
            if node.type != "SEPARATE_COLOR":
                continue
            sources = [entry.from_node for entry in node.inputs["Color"].links if entry.from_node.type == "TEX_IMAGE"]
            if not sources or sources[0].image is None or ARM_MARKER not in sources[0].image.filepath.lower():
                continue
            group_node = tree.nodes.new("ShaderNodeGroup")
            group_node.node_tree = occlusion_group()
            tree.links.new(node.outputs["Red"], group_node.inputs["Occlusion"])
            break


def thin_glass(obj: Object) -> None:
    for slot in obj.material_slots:
        made: Material | None = slot.material
        if made is None or made.node_tree is None or made.blend_method != "BLEND":
            continue
        shader = next((node for node in made.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
        if shader is None:
            continue
        for link in list(shader.inputs["Alpha"].links):
            made.node_tree.links.remove(link)
        shader.inputs["Alpha"].default_value = GLASS_ALPHA


def flatten_metallic(obj: Object) -> None:
    for slot in obj.material_slots:
        if slot.material is None or slot.material.node_tree is None:
            continue
        tree = slot.material.node_tree
        shader = next((node for node in tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
        if shader is None:
            continue
        socket = shader.inputs["Metallic"]
        for link in list(socket.links):
            if link.from_node.type != "MATH":
                continue
            math = link.from_node
            source = next((entry.from_node for entry in math.inputs[0].links), None)
            tree.links.remove(link)
            if math.inputs[1].default_value > METAL_EPSILON or source is None:
                socket.default_value = math.inputs[1].default_value
                continue
            tree.links.new(source.outputs["Blue"], socket)
            for entry in source.inputs["Color"].links:
                if entry.from_node.type == "TEX_IMAGE" and entry.from_node.image is not None:
                    entry.from_node.image = roughness_only_copy(entry.from_node.image)


def downsize_textures(obj: Object, size: int) -> None:
    for slot in obj.material_slots:
        if slot.material is None or slot.material.node_tree is None:
            continue
        for node in slot.material.node_tree.nodes:
            if node.type != "TEX_IMAGE" or node.image is None:
                continue
            image: Image = node.image
            width, height = image.size
            longest: int = max(width, height)
            if longest > size:
                factor: float = size / longest
                image.scale(max(MIN_TEXTURE_SIZE, round(width * factor)), max(MIN_TEXTURE_SIZE, round(height * factor)))


def export(obj: Object, path: str) -> None:
    select_only([obj])
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_yup=True,
        export_image_format="WEBP",
        export_image_quality=WEBP_QUALITY,
        export_image_add_webp=False,
        export_image_webp_fallback=False,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )


def build(entry: dict[str, Any], downloads: str, output: str) -> None:
    clear_scene()
    objects: list[Object] = import_asset(downloads, entry["asset"])
    meshes: list[Object] = wanted_meshes(entry, objects)
    joined: Object = join_and_bake_transforms(meshes, entry["id"])
    rotate(joined, entry.get("rotate", [0.0, 0.0, 0.0]))
    decimate(joined, entry["maxTriangles"])
    ground(joined)
    flatten_metallic(joined)
    thin_glass(joined)
    wire_occlusion(joined)
    downsize_textures(joined, entry.get("textureSize", DEFAULT_TEXTURE_SIZE))
    export(joined, f"{output}/{entry['id']}.glb")
    print(f"BUILT {entry['id']} {triangle_count(joined)}")


def main() -> None:
    arguments: list[str] = sys.argv[sys.argv.index(ARGUMENT_SEPARATOR) + 1 :]
    manifest_path, downloads, output = arguments[0], arguments[1], arguments[2]
    only: set[str] = set()
    for extra in arguments[3:]:
        if extra.startswith(ONLY_PREFIX):
            only = set(extra[len(ONLY_PREFIX) :].split(","))
    with open(manifest_path, encoding="utf-8") as handle:
        entries: list[dict[str, Any]] = json.load(handle)["models"]
    for entry in entries:
        if only and entry["id"] not in only:
            continue
        build(entry, downloads, output)


main()
