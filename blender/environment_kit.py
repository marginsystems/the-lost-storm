import math
import random

import bmesh
import bpy
from bmesh.types import BMEdge, BMesh, BMFace, BMVert
from bpy.types import Material, Object
from mathutils import Matrix, Vector, noise

Color = tuple[float, float, float]

SHARP_ANGLE: float = math.radians(38.0)
BEVEL_SHARE: float = 0.09
BEVEL_MAX: float = 0.035
BEVEL_MIN_SIDE: float = 0.045
SHEET_THICKNESS: float = 0.012
SHEET_NOISE_SCALE: float = 1.7
EMISSION_STRENGTH: float = 2.2

PALETTE: dict[str, tuple[Color, float, float, bool]] = {
    "bark": ((0.2, 0.16, 0.13), 0.0, 0.95, False),
    "stone": ((0.42, 0.4, 0.38), 0.0, 0.9, False),
    "wood": ((0.24, 0.17, 0.11), 0.0, 0.85, False),
    "iron": ((0.09, 0.09, 0.09), 0.8, 0.6, False),
    "cloth": ((0.3, 0.3, 0.34), 0.0, 0.95, False),
    "earth": ((0.2, 0.15, 0.11), 0.0, 1.0, False),
    "plaster": ((0.6, 0.56, 0.48), 0.0, 0.95, False),
    "roof": ((0.22, 0.22, 0.24), 0.0, 0.85, False),
    "wax": ((0.78, 0.72, 0.58), 0.0, 0.6, False),
    "void": ((0.01, 0.01, 0.012), 0.0, 1.0, False),
    "gold": ((0.86, 0.62, 0.2), 0.25, 0.38, False),
    "flame": ((1.0, 0.56, 0.16), 0.0, 1.0, True),
    "glow": ((1.0, 0.68, 0.3), 0.0, 1.0, True),
}


def material(name: str) -> Material:
    found: Material | None = bpy.data.materials.get(name)
    if found is not None:
        return found
    color, metallic, roughness, emissive = PALETTE[name]
    made: Material = bpy.data.materials.new(name)
    made.use_nodes = True
    shader = next(node for node in made.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if emissive:
        shader.inputs["Emission Color"].default_value = (color[0], color[1], color[2], 1.0)
        shader.inputs["Emission Strength"].default_value = EMISSION_STRENGTH
    return made


class Kit:
    def __init__(self, seed: int) -> None:
        self.parts: dict[str, BMesh] = {}
        self.rng: random.Random = random.Random(seed)

    def mesh(self, name: str) -> BMesh:
        found: BMesh | None = self.parts.get(name)
        if found is not None:
            return found
        made: BMesh = bmesh.new()
        self.parts[name] = made
        return made

    def spread(self, amount: float) -> float:
        return (self.rng.random() * 2.0 - 1.0) * amount

    def placed(self, x: float, y: float, z: float, yaw: float, tilt_x: float, tilt_y: float) -> Matrix:
        return Matrix.Translation((x, y, z)) @ Matrix.Rotation(yaw, 4, "Z") @ Matrix.Rotation(tilt_x, 4, "X") @ Matrix.Rotation(tilt_y, 4, "Y")

    def box(self, name: str, x: float, y: float, z: float, sx: float, sy: float, sz: float, yaw: float = 0.0, tilt_x: float = 0.0, tilt_y: float = 0.0, jitter: float = 0.0) -> None:
        shape: Matrix = self.placed(x, y, z, yaw, tilt_x, tilt_y) @ Matrix.Translation((0.0, 0.0, sz / 2.0)) @ Matrix.Diagonal((sx, sy, sz, 1.0))
        self.chamfered(name, shape, min(sx, sy, sz), jitter)

    def chamfered(self, name: str, shape: Matrix, thinnest: float, jitter: float) -> None:
        target: BMesh = self.mesh(name)
        made = bmesh.ops.create_cube(target, size=1.0, matrix=shape)
        if jitter > 0.0:
            for vert in made["verts"]:
                vert.co += Vector((self.spread(jitter), self.spread(jitter), self.spread(jitter)))
        if thinnest < BEVEL_MIN_SIDE:
            return
        edges: set[BMEdge] = set()
        for vert in made["verts"]:
            edges.update(vert.link_edges)
        bmesh.ops.bevel(target, geom=list(edges), offset=min(BEVEL_MAX, thinnest * BEVEL_SHARE), segments=1, affect="EDGES", profile=0.5)

    def sheet(self, name: str, corner: tuple[float, float, float], across: tuple[float, float, float], down: tuple[float, float, float], columns: int, rows: int, billow: float, ragged: float = 0.0, pinned: bool = True) -> None:
        target: BMesh = self.mesh(name)
        origin: Vector = Vector(corner)
        u: Vector = Vector(across)
        v: Vector = Vector(down)
        out: Vector = u.cross(v).normalized()
        offset: Vector = Vector((self.rng.random() * 40.0, self.rng.random() * 40.0, self.rng.random() * 40.0))
        hems: list[float] = [1.0 - self.rng.random() * ragged for _ in range(columns + 1)]
        front: list[list[BMVert]] = []
        back: list[list[BMVert]] = []
        for row in range(rows + 1):
            front_row: list[BMVert] = []
            back_row: list[BMVert] = []
            for column in range(columns + 1):
                s: float = column / columns
                t: float = row / rows * hems[column]
                at: Vector = origin + u * s + v * t
                held: float = math.sin(math.pi * t) * math.sin(math.pi * s) if pinned else t
                swell: float = (noise.noise(at * SHEET_NOISE_SCALE + offset) * 0.6 + held) * billow
                at += out * swell
                front_row.append(target.verts.new(at))
                back_row.append(target.verts.new(at - out * SHEET_THICKNESS))
            front.append(front_row)
            back.append(back_row)
        for row in range(rows):
            for column in range(columns):
                upper: BMFace = target.faces.new((front[row][column], front[row][column + 1], front[row + 1][column + 1], front[row + 1][column]))
                lower: BMFace = target.faces.new((back[row][column], back[row + 1][column], back[row + 1][column + 1], back[row][column + 1]))
                upper.smooth = True
                lower.smooth = True

    def cylinder(self, name: str, x: float, y: float, z: float, radius: float, height: float, segments: int = 10, top: float | None = None, yaw: float = 0.0, tilt_x: float = 0.0, tilt_y: float = 0.0) -> None:
        shape: Matrix = self.placed(x, y, z, yaw, tilt_x, tilt_y) @ Matrix.Translation((0.0, 0.0, height / 2.0))
        made = bmesh.ops.create_cone(self.mesh(name), cap_ends=True, cap_tris=False, segments=segments, radius1=radius, radius2=radius if top is None else top, depth=height, matrix=shape)
        faces: set[BMFace] = set()
        for vert in made["verts"]:
            faces.update(vert.link_faces)
        for face in faces:
            face.smooth = True

    def blob(self, name: str, x: float, y: float, z: float, rx: float, ry: float, rz: float, rough: float, detail: int = 2, yaw: float = 0.0) -> None:
        shape: Matrix = self.placed(x, y, z, yaw, 0.0, 0.0) @ Matrix.Diagonal((rx, ry, rz, 1.0))
        made = bmesh.ops.create_icosphere(self.mesh(name), subdivisions=detail, radius=1.0, matrix=shape)
        offset: Vector = Vector((self.rng.random() * 40.0, self.rng.random() * 40.0, self.rng.random() * 40.0))
        verts: list[BMVert] = list(made["verts"])
        for vert in verts:
            swell: float = noise.noise(vert.co * 1.3 + offset) * rough
            vert.co += (vert.co - Vector((x, y, z))).normalized() * swell
            if vert.co.z < z - rz * 0.25:
                vert.co.z = z - rz * 0.25
        faces: set[BMFace] = set()
        for vert in verts:
            faces.update(vert.link_faces)
        for face in faces:
            face.smooth = True

    def beam(self, name: str, start: tuple[float, float, float], end: tuple[float, float, float], width: float, depth: float) -> None:
        a: Vector = Vector(start)
        b: Vector = Vector(end)
        along: Vector = b - a
        length: float = along.length
        turn: Matrix = along.to_track_quat("Z", "Y").to_matrix().to_4x4()
        shape: Matrix = Matrix.Translation(a) @ turn @ Matrix.Translation((0.0, 0.0, length / 2.0)) @ Matrix.Diagonal((width, depth, length, 1.0))
        self.chamfered(name, shape, min(width, depth, length), 0.0)

    def rod(self, name: str, start: tuple[float, float, float], end: tuple[float, float, float], radius: float, segments: int = 6, top: float | None = None) -> None:
        a: Vector = Vector(start)
        b: Vector = Vector(end)
        along: Vector = b - a
        turn: Matrix = along.to_track_quat("Z", "Y").to_matrix().to_4x4()
        shape: Matrix = Matrix.Translation(a) @ turn @ Matrix.Translation((0.0, 0.0, along.length / 2.0))
        made = bmesh.ops.create_cone(self.mesh(name), cap_ends=True, cap_tris=False, segments=segments, radius1=radius, radius2=radius if top is None else top, depth=along.length, matrix=shape)
        faces: set[BMFace] = set()
        for vert in made["verts"]:
            faces.update(vert.link_faces)
        for face in faces:
            face.smooth = True

    def courses(self, name: str, x0: float, x1: float, y: float, thickness: float, heights: list[float], jitter: float = 0.03) -> None:
        count: int = len(heights)
        width: float = (x1 - x0) / count
        for index, height in enumerate(heights):
            if height <= 0.0:
                continue
            self.box(name, x0 + width * (index + 0.5), y + self.spread(jitter), 0.0, width, thickness + self.spread(jitter), height)

    def scatter_blocks(self, name: str, count: int, x0: float, x1: float, y0: float, y1: float, low: float, high: float) -> None:
        for _ in range(count):
            size: float = low + self.rng.random() * (high - low)
            self.box(
                name,
                x0 + self.rng.random() * (x1 - x0),
                y0 + self.rng.random() * (y1 - y0),
                -size * 0.12,
                size * (1.0 + self.rng.random() * 0.7),
                size,
                size * (0.55 + self.rng.random() * 0.35),
                yaw=self.rng.random() * math.pi,
                tilt_x=self.spread(0.35),
                tilt_y=self.spread(0.35),
                jitter=size * 0.06,
            )

    def limb(self, name: str, start: Vector, heading: Vector, length: float, radius: float, depth: int) -> None:
        pieces: int = 3
        at: Vector = start.copy()
        toward: Vector = heading.normalized()
        for index in range(pieces):
            toward = (toward + Vector((self.spread(0.28), self.spread(0.28), self.spread(0.12)))).normalized()
            end: Vector = at + toward * (length / pieces)
            thick: float = radius * (1.0 - 0.5 * index / pieces)
            thin: float = radius * (1.0 - 0.5 * (index + 1) / pieces)
            self.rod(name, (at.x, at.y, at.z), (end.x, end.y, end.z), thick, segments=7 if radius > 0.08 else 5, top=thin)
            at = end
            if depth > 0 and index >= 1:
                side: Vector = toward.cross(Vector((self.spread(1.0), self.spread(1.0), self.spread(1.0)))).normalized()
                self.limb(name, at, toward * 0.45 + side + Vector((0.0, 0.0, 0.25)), length * 0.62, thin * 0.72, depth - 1)
        if depth > 0:
            fork: Vector = toward.cross(Vector((self.spread(1.0), self.spread(1.0), 0.3))).normalized()
            self.limb(name, at, toward + fork * 0.7, length * 0.6, radius * 0.42, depth - 1)
            self.limb(name, at, toward - fork * 0.6, length * 0.5, radius * 0.38, depth - 1)

    def flame(self, x: float, y: float, z: float, size: float) -> None:
        self.cylinder("flame", x, y, z, size * 0.5, size * 1.6, segments=6, top=0.0)
        self.cylinder("flame", x, y, z - size * 0.35, size * 0.2, size * 0.36, segments=6, top=size * 0.5)


def unwrap(made: BMesh) -> None:
    layer = made.loops.layers.uv.verify()
    for face in made.faces:
        normal: Vector = face.normal
        ax: float = abs(normal.x)
        ay: float = abs(normal.y)
        az: float = abs(normal.z)
        for loop in face.loops:
            co: Vector = loop.vert.co
            if az >= ax and az >= ay:
                loop[layer].uv = (co.x, co.y)
            elif ax >= ay:
                loop[layer].uv = (co.y, co.z)
            else:
                loop[layer].uv = (co.x, co.z)


def sharpen(made: BMesh) -> None:
    for edge in made.edges:
        if len(edge.link_faces) != 2 or edge.calc_face_angle(0.0) > SHARP_ANGLE:
            edge.smooth = False


def clear_scene() -> None:
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)


def export(kit: Kit, path: str) -> int:
    clear_scene()
    triangles: int = 0
    for name, made in kit.parts.items():
        if len(made.faces) == 0:
            made.free()
            continue
        made.normal_update()
        unwrap(made)
        sharpen(made)
        bmesh.ops.triangulate(made, faces=made.faces[:])
        triangles += len(made.faces)
        mesh = bpy.data.meshes.new(name)
        made.to_mesh(mesh)
        made.free()
        mesh.materials.append(material(name))
        obj: Object = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=True, export_animations=False, export_cameras=False, export_lights=False)
    return triangles
