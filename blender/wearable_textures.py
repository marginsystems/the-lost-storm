import math
from dataclasses import dataclass
from pathlib import Path

import bpy
import numpy as np
from bpy.types import Image, Material, Object
from bpy_extras import mesh_utils

PADDING_SHARE: float = 1.0 / 128.0
MIN_ISLAND_PIXELS: float = 2.0
PACK_STEPS: int = 28
FLAT_NORMAL: tuple[float, float, float, float] = (0.5, 0.5, 1.0, 1.0)
PLAIN_ROUGHNESS: float = 1.0
LUMA: tuple[float, float, float] = (0.2126, 0.7152, 0.0722)


@dataclass
class Island:
    polygons: list[int]
    low: tuple[float, float]
    size: tuple[float, float]
    origin: tuple[float, float] = (0.0, 0.0)


def source_images(obj: Object, dropped: tuple[str, ...]) -> dict[str, Image]:
    found: dict[str, Image] = {}
    for made in obj.data.materials:
        if made is None or made.name.split(".")[0] in dropped or not made.use_nodes:
            continue
        shader = next(node for node in made.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
        for key, socket in (("color", "Base Color"), ("orm", "Roughness"), ("normal", "Normal")):
            image: Image | None = upstream_image(shader.inputs[socket])
            if image is None:
                continue
            if key in found and found[key].filepath != image.filepath:
                raise RuntimeError(f"{obj.name}: materials disagree on the {key} texture")
            found[key] = image
    if "color" not in found:
        raise RuntimeError(f"{obj.name}: no base colour texture")
    return found


def upstream_image(socket) -> Image | None:
    pending = [link.from_node for link in socket.links]
    seen: set[str] = set()
    while pending:
        node = pending.pop()
        if node.name in seen:
            continue
        seen.add(node.name)
        if node.type == "TEX_IMAGE" and node.image is not None:
            return node.image
        for entry in node.inputs:
            pending.extend(link.from_node for link in entry.links)
    return None


def uv_islands(obj: Object) -> list[Island]:
    mesh = obj.data
    layer = mesh.uv_layers.active.data
    merged: dict[tuple[int, int, int, int], Island] = {}
    for polygons in mesh_utils.mesh_linked_uv_islands(mesh):
        us: list[float] = []
        vs: list[float] = []
        for index in polygons:
            for loop in mesh.polygons[index].loop_indices:
                us.append(layer[loop].uv.x)
                vs.append(layer[loop].uv.y)
        low: tuple[float, float] = (min(us), min(vs))
        size: tuple[float, float] = (max(us) - low[0], max(vs) - low[1])
        key = (round(low[0] * 4096), round(low[1] * 4096), round(size[0] * 4096), round(size[1] * 4096))
        if key in merged:
            merged[key].polygons.extend(polygons)
        else:
            merged[key] = Island(list(polygons), low, size)
    return list(merged.values())


def shelf_pack(islands: list[Island], scale: float, side: int, padding: float) -> bool:
    cursor_x: float = 0.0
    cursor_y: float = 0.0
    shelf: float = 0.0
    for island in sorted(islands, key=lambda entry: -entry.size[1]):
        width: float = max(island.size[0] * scale, MIN_ISLAND_PIXELS) + 2.0 * padding
        height: float = max(island.size[1] * scale, MIN_ISLAND_PIXELS) + 2.0 * padding
        if width > side:
            return False
        if cursor_x + width > side:
            cursor_x = 0.0
            cursor_y += shelf
            shelf = 0.0
        if cursor_y + height > side:
            return False
        island.origin = (cursor_x + padding, cursor_y + padding)
        cursor_x += width
        shelf = max(shelf, height)
    return True


def pack(islands: list[Island], side: int, padding: float) -> float:
    low: float = 0.0
    high: float = side / max(max(island.size[0], island.size[1], 1e-6) for island in islands)
    for _ in range(PACK_STEPS):
        middle: float = (low + high) / 2.0
        if shelf_pack(islands, middle, side, padding):
            low = middle
        else:
            high = middle
    if low <= 0.0 or not shelf_pack(islands, low, side, padding):
        raise RuntimeError("the UV islands do not fit the texture")
    return low


def pixels_of(image: Image) -> np.ndarray:
    width, height = image.size
    data = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(data)
    return data.reshape(height, width, 4)


def reduced(pixels: np.ndarray, texels_per_pixel: float) -> np.ndarray:
    out: np.ndarray = pixels
    for _ in range(max(0, int(math.floor(math.log2(max(texels_per_pixel, 1.0)))))):
        height, width, channels = out.shape
        out = out[: height - height % 2, : width - width % 2].reshape(height // 2, 2, width // 2, 2, channels).mean(axis=(1, 3))
    return out


def sample(pixels: np.ndarray, u: np.ndarray, v: np.ndarray) -> np.ndarray:
    height, width, _ = pixels.shape
    x = np.clip(u * width - 0.5, 0.0, width - 1.0)
    y = np.clip(v * height - 0.5, 0.0, height - 1.0)
    x0 = np.floor(x).astype(np.int64)
    y0 = np.floor(y).astype(np.int64)
    x1 = np.minimum(x0 + 1, width - 1)
    y1 = np.minimum(y0 + 1, height - 1)
    fx = (x - x0)[..., None]
    fy = (y - y0)[..., None]
    return (pixels[y0, x0] * (1.0 - fx) + pixels[y0, x1] * fx) * (1.0 - fy) + (pixels[y1, x0] * (1.0 - fx) + pixels[y1, x1] * fx) * fy


def repacked(image: Image, islands: list[Island], scale: float, side: int, padding: float, fill: tuple[float, float, float, float] | None) -> np.ndarray:
    source: np.ndarray = reduced(pixels_of(image), image.size[0] / scale)
    out = np.zeros((side, side, 4), dtype=np.float32)
    covered = np.zeros((side, side), dtype=bool)
    for island in islands:
        width: float = max(island.size[0] * scale, MIN_ISLAND_PIXELS)
        height: float = max(island.size[1] * scale, MIN_ISLAND_PIXELS)
        x0: int = max(0, int(math.floor(island.origin[0] - padding)))
        y0: int = max(0, int(math.floor(island.origin[1] - padding)))
        x1: int = min(side, int(math.ceil(island.origin[0] + width + padding)))
        y1: int = min(side, int(math.ceil(island.origin[1] + height + padding)))
        xs, ys = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
        u = island.low[0] + (xs - island.origin[0]) / scale
        v = island.low[1] + (ys - island.origin[1]) / scale
        out[y0:y1, x0:x1] = sample(source, u, v)
        covered[y0:y1, x0:x1] = True
    background = np.array(fill, dtype=np.float32) if fill is not None else out[covered].mean(axis=0)
    out[~covered] = background
    out[..., 3] = 1.0
    return out


def move_uvs(obj: Object, islands: list[Island], scale: float, side: int) -> None:
    mesh = obj.data
    layer = mesh.uv_layers.active.data
    for island in islands:
        for index in island.polygons:
            for loop in mesh.polygons[index].loop_indices:
                uv = layer[loop].uv
                layer[loop].uv = ((island.origin[0] + (uv.x - island.low[0]) * scale) / side, (island.origin[1] + (uv.y - island.low[1]) * scale) / side)


def new_image(name: str, pixels: np.ndarray, colorspace: str, folder: Path) -> Image:
    side: int = pixels.shape[0]
    image: Image = bpy.data.images.new(name, side, side, alpha=False)
    image.colorspace_settings.name = colorspace
    image.pixels.foreach_set(pixels.reshape(-1))
    image.filepath_raw = str(folder / f"{name}.png")
    image.file_format = "PNG"
    image.save()
    return image


def toned(pixels: np.ndarray, desaturate: float, luma: float | None) -> np.ndarray:
    out = pixels.copy()
    weights = np.array(LUMA, dtype=np.float32)
    if desaturate > 0.0:
        grey = (out[..., :3] * weights).sum(axis=2, keepdims=True)
        out[..., :3] = out[..., :3] * (1.0 - desaturate) + grey * desaturate
    if luma is not None:
        mean: float = float((out[..., :3] * weights).sum(axis=2).mean())
        if mean > 0.0:
            out[..., :3] = np.clip(out[..., :3] * (luma / mean), 0.0, 1.0)
    return out


def retexture(obj: Object, name: str, side: int, images: dict[str, Image], scratch: Path, desaturate: float = 0.0, luma: float | None = None) -> None:
    padding: float = max(2.0, side * PADDING_SHARE)
    islands: list[Island] = uv_islands(obj)
    scale: float = pack(islands, side, padding)
    made: Material = bpy.data.materials.new(f"M_{name}")
    made.use_nodes = True
    made.use_backface_culling = False
    nodes = made.node_tree.nodes
    links = made.node_tree.links
    shader = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    color = nodes.new("ShaderNodeTexImage")
    color.image = new_image(f"{name}_color", toned(repacked(images["color"], islands, scale, side, padding, None), desaturate, luma), "sRGB", scratch)
    links.new(color.outputs["Color"], shader.inputs["Base Color"])
    if "orm" in images:
        orm = nodes.new("ShaderNodeTexImage")
        orm.image = new_image(f"{name}_orm", repacked(images["orm"], islands, scale, side, padding, None), "Non-Color", scratch)
        split = nodes.new("ShaderNodeSeparateColor")
        links.new(orm.outputs["Color"], split.inputs["Color"])
        links.new(split.outputs["Green"], shader.inputs["Roughness"])
        links.new(split.outputs["Blue"], shader.inputs["Metallic"])
    else:
        shader.inputs["Roughness"].default_value = PLAIN_ROUGHNESS
        shader.inputs["Metallic"].default_value = 0.0
    if "normal" in images:
        normal = nodes.new("ShaderNodeTexImage")
        normal.image = new_image(f"{name}_normal", repacked(images["normal"], islands, scale, side, padding, FLAT_NORMAL), "Non-Color", scratch)
        bump = nodes.new("ShaderNodeNormalMap")
        links.new(normal.outputs["Color"], bump.inputs["Color"])
        links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    move_uvs(obj, islands, scale, side)
    mesh = obj.data
    mesh.materials.clear()
    mesh.materials.append(made)
    for polygon in mesh.polygons:
        polygon.material_index = 0
    for attribute in list(mesh.color_attributes):
        mesh.color_attributes.remove(attribute)
    for layer in list(mesh.uv_layers):
        if layer != mesh.uv_layers.active:
            mesh.uv_layers.remove(layer)
