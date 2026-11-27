import math
import sys
from bisect import bisect_right
from pathlib import Path
from tempfile import TemporaryDirectory

import bpy
import numpy as np
from mathutils import Quaternion, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_struck_bodies import X, Z, clip, export, material, move, reset, skeleton, world_turn
from serpent_skin import maps
from serpent_fork import branch_name, neck_curve

LENGTH = 2.76
HEAD = 0.877
HINGE = 0.908
SPINE = np.linspace(0, HEAD, 19)
NAMES = [f"Spine_{i:02d}" for i in range(len(SPINE) - 1)] + ["Head"]
RINGS = 60
SIDES = 30
LIP = SIDES // 5
PROFILE = (
    (0, 0.0015, 0.0015),
    (0.025, 0.014, 0.012),
    (0.075, 0.032, 0.026),
    (0.16, 0.062, 0.048),
    (0.29, 0.104, 0.078),
    (0.45, 0.136, 0.103),
    (0.59, 0.143, 0.108),
    (0.70, 0.122, 0.098),
    (0.79, 0.084, 0.072),
    (0.85, 0.063, 0.061),
    (0.875, 0.065, 0.061),
    (0.894, 0.103, 0.065),
    (0.91, 0.134, 0.071),
    (0.929, 0.129, 0.075),
    (0.949, 0.10, 0.069),
    (0.968, 0.085, 0.057),
    (0.986, 0.073, 0.047),
    (0.995, 0.053, 0.038),
    (0.998, 0.039, 0.029),
    (0.9996, 0.021, 0.016),
    (1, 0.003, 0.003),
)
STATIONS, WIDTHS, HEIGHTS = np.array(PROFILE).T


def ease(a: float, b: float, x: float) -> float:
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def pose_curve(mode: str, t: float, anchor: tuple | None = None) -> tuple:
    s = np.linspace(0, HEAD, 181)
    k = 2 * math.pi
    walk = mode == "walk"
    wind = ease(0, 0.34, t) * (1 - ease(0.34, 0.49, t)) if mode == "attack" else 0
    hit = ease(0.32, 0.50, t) * (1 - ease(0.52, 0.95, t)) if mode == "attack" else 0
    phase = k * t if walk else 0
    spine_wave = 1.32 * np.sin(s * 10.8 + 0.60 + phase) + 0.20 * np.sin(s * 17 - 0.8 + phase)
    neck = np.clip((s - 0.67) / 0.207, 0, 1)
    neck *= neck * (3 - 2 * neck)
    yaw = (1 - neck) * spine_wave + neck * (0.24 if not walk else 0.16 * np.sin(phase))
    yaw += (0.04 * math.sin(k * t) if mode == "idle" else 0) * neck
    front = np.clip((s - 0.38) / 0.23, 0, 1)
    yaw *= 1 + front * (0.60 * wind - 0.93 * hit)
    h = np.interp(s, STATIONS, HEIGHTS) * 0.81 + 0.004
    rise = 0.29 if not walk else 0.13
    if mode == "crush":
        rear = ease(0, 0.37, t) * (1 - ease(0.37, 0.5, t))
        slam = ease(0.37, 0.5, t) * (1 - ease(0.54, 1, t))
        rise += 0.22 * rear - 0.28 * slam
    h += rise * neck + (s / HEAD) ** 7 * (wind * 0.12 + hit * 0.02)
    if mode == "idle":
        h += 0.012 * math.sin(k * t) * neck
    step = LENGTH * (s[1] - s[0])
    dz = np.diff(h)
    run = np.sqrt(np.maximum(0, step**2 - dz**2))
    bearing = (yaw[1:] + yaw[:-1]) * 0.5
    x = np.r_[0, np.cumsum(np.sin(bearing) * run)]
    y = np.r_[0, np.cumsum(-np.cos(bearing) * run)]
    if mode == "attack" and anchor is not None:
        x += anchor[1][0]
        y += anchor[2][0]
    else:
        x -= x[-1] - (0.055 * math.sin(phase) if walk else 0)
        y -= y[-1] + 0.475
    pitch = np.arctan2(np.gradient(h), np.hypot(np.gradient(x), np.gradient(y)))
    return s, x, y, h, np.arctan2(np.gradient(x), -np.gradient(y)), pitch


def frame(curve: tuple, s: float) -> tuple[Vector, Quaternion]:
    stations, *channels = curve
    x, y, z, yaw, pitch = (float(np.interp(s, stations, a)) for a in channels)
    rot = Quaternion(Z, yaw) @ Quaternion(X, -pitch)
    centre = Vector((x, y, z))
    if s > HEAD:
        centre += rot @ Vector((0, -(s - HEAD) * LENGTH, 0))
    return centre, rot


def uv_s(s: float) -> float:
    return 0.70 * s / 0.865 if s < 0.865 else 0.70 + 0.27 * (s - 0.865) / 0.135


def surface(s: float, v: float) -> Vector:
    w = float(np.interp(s, STATIONS, WIDTHS))
    h = float(np.interp(s, STATIONS, HEIGHTS))
    a = 2 * math.pi * (v - 0.5)
    side, top = math.sin(a), math.cos(a)
    head = ease(0.867, 0.916, s)
    brow = math.exp(-(((s - 0.949) / 0.014) ** 2) - ((abs(v - 0.5) * 2 - 0.31) / 0.12) ** 2)
    x = w * math.copysign(abs(side) ** (1 - 0.12 * head), side) * (1 + 0.035 * brow)
    z = h * math.copysign(abs(top) ** (1 - 0.36 * head), top)
    if z < 0:
        z *= 0.80
    return Vector((x, 0, z + 0.009 * brow))


def build(target: Path, scratch: Path, twin: bool = False) -> None:
    reset()
    rest = pose_curve("idle", 0)
    fork = float(SPINE[12])
    sides = (-1, 1) if twin else (0,)
    rest_curves = {side: neck_curve(rest, side, "idle", 0, fork) for side in (0, *sides)}
    bones = [("Root", None, (0, 0, 0), (0, 0.03, 0))]

    def joint(index: int, side: int) -> str:
        return branch_name(NAMES[index], side if SPINE[index] > fork else 0)

    for side in sides:
        curve = rest_curves[side]
        for i, s in enumerate(SPINE):
            if side == 1 and s <= fork:
                continue
            pos, _ = frame(curve, s)
            bones.append((joint(i, side), "Root", pos, pos + Vector((0, 0.05, 0))))
        for name, s, dz in (("Jaw", HINGE, -0.014), ("Fangs", 0.969, -0.018)):
            point, turn = frame(curve, s)
            point += turn @ Vector((0, 0, dz))
            bones.append(
                (branch_name(name, side), branch_name("Head", side), point, point + Vector((0, 0.035, 0)))
            )
    arm = skeleton("Sundercoil" if twin else "HourfallAdder", bones)
    verts, faces, uvs, weights = [], [], [], []

    def vertex(s: float, local: Vector, uv: tuple, lower: bool = False) -> int:
        centre, rot = frame(rest_curves[side], s)
        verts.append(centre + rot @ local)
        uvs.append(uv)
        hi = max(1, min(len(SPINE) - 1, bisect_right(SPINE, s)))
        blend = min(1, max(0, (s - SPINE[hi - 1]) / (SPINE[hi] - SPINE[hi - 1])))
        jaw = ease(HINGE - 0.014, HINGE + 0.016, s) if lower else 0
        weights.append(
            {
                joint(hi - 1, side): (1 - blend) * (1 - jaw),
                joint(hi, side): blend * (1 - jaw),
                branch_name("Jaw", side): jaw,
            }
        )
        return len(verts) - 1

    stations = sorted(
        set([i / RINGS for i in range(RINGS + 1)] + [x[0] for x in PROFILE] + [HINGE - 0.014, HINGE])
    )
    shell_normals = {}

    def section(s: float, v: float) -> Vector:
        point = surface(s, v)
        if side and point.x * side < 0:
            point.x *= ease(fork, fork + 0.10, s)
        return point

    if twin:
        stations = sorted(set([*stations, fork]))
    paths = [(0, [s for s in stations if s <= fork])] if twin else []
    paths.extend((side, [s for s in stations if s >= fork] if twin else stations) for side in sides)
    for side, run in paths:
        last = {}
        for s in run:
            row = {}
            a, b = max(0, s - 0.001), min(1, s + 0.001)
            pa, qa = frame(rest_curves[side], a)
            pb, qb = frame(rest_curves[side], b)
            _, q = frame(rest_curves[side], s)
            for strip, (start, end) in enumerate(((0, LIP), (LIP, SIDES - LIP), (SIDES - LIP, SIDES))):
                for j in range(start, end + 1):
                    v = j / SIDES
                    key = (strip, j)
                    row[key] = vertex(s, section(s, v), (uv_s(s), v), strip != 1)
                    along = pb + qb @ section(b, v) - pa - qa @ section(a, v)
                    around = q @ (section(s, v + 0.001) - section(s, v - 0.001))
                    shell_normals[row[key]] = along.cross(around).normalized()
                    if last and j > start:
                        prev = (strip, j - 1)
                        faces.append((last[prev], row[prev], row[key], last[key]))
            if s == 0:
                faces.append(tuple(row[(0 if j < LIP else 1 if j < SIDES - LIP else 2, j)] for j in range(SIDES)))
            elif s == 1:
                faces.append(tuple(row[(1, j)] for j in reversed(range(LIP, SIDES - LIP + 1))))
                faces.append(
                    tuple(
                        reversed(
                            [row[(2, j)] for j in range(SIDES - LIP, SIDES)]
                            + [row[(0, j)] for j in range(LIP + 1)]
                        )
                    )
                )
            last = row

    palate_stations = [s for s in stations if s >= HINGE - 0.014]
    for side in sides:
        for lower in (False, True):
            last_rim = None
            for s in palate_stations:
                rim = []
                left, right = surface(s, 0.2), surface(s, 0.8)
                for i in range(7):
                    across = i / 6
                    edge = left.lerp(right, across)
                    arch = math.sin(across * math.pi) * min(1, max(0, (1 - s) * 50))
                    edge.z += (-0.007 if lower else 0.009) * arch
                    pigment = 0.980 + 0.013 * (s - HINGE) / (1 - HINGE)
                    rim.append(vertex(s, edge, (pigment, 0.38 + across * 0.038), lower))
                if last_rim:
                    for i in range(6):
                        quad = (last_rim[i], last_rim[i + 1], rim[i + 1], rim[i])
                        faces.append(tuple(reversed(quad)) if lower else quad)
                last_rim = rim

        for sign in (-1, 1):
            rings = []
            for depth, radius in ((0, 0.010), (0.018, 0.009), (0.047, 0.005), (0.065, 0.0006)):
                ring = []
                for j in range(8):
                    angle = j * 2 * math.pi / 8
                    delta = Vector(
                        (
                            sign * 0.044 + radius * math.cos(angle),
                            depth + radius * math.sin(angle) * 0.25,
                            -0.018 - 0.14 * depth + 1.2 * depth**2 + radius * math.sin(angle),
                        )
                    )
                    ring.append(vertex(0.969, delta, (0.988, 0.80)))
                    weights[ring[-1]] = {branch_name("Fangs", side): 1.0}
                if rings:
                    for j in range(8):
                        faces.append((rings[-1][j], ring[j], ring[(j + 1) % 8], rings[-1][(j + 1) % 8]))
                rings.append(ring)

    mesh = bpy.data.meshes.new("Adder")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    skin = material("Keeled scales", (1, 1, 1), 0.86)
    shader = skin.node_tree.nodes.get("Principled BSDF")
    pigment, relief = maps(scratch, twin)
    for path, is_normal in ((pigment, False), (relief, True)):
        tex = skin.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(str(path))
        tex.image.pack()
        output = tex.outputs["Color"]
        if is_normal:
            tex.image.colorspace_settings.name = "Non-Color"
            normal = skin.node_tree.nodes.new("ShaderNodeNormalMap")
            normal.inputs["Strength"].default_value = 0.92
            skin.node_tree.links.new(output, normal.inputs["Color"])
            output = normal.outputs["Normal"]
        skin.node_tree.links.new(output, shader.inputs["Normal" if is_normal else "Base Color"])
    mesh.materials.append(skin)
    uv = mesh.uv_layers.new(name="Adder skin")
    for loop in mesh.loops:
        uv.data[loop.index].uv = uvs[loop.vertex_index]
    for poly in mesh.polygons:
        poly.use_smooth = True
    mesh.normals_split_custom_set(
        [shell_normals.get(loop.vertex_index, mesh.vertices[loop.vertex_index].normal) for loop in mesh.loops]
    )
    obj = bpy.data.objects.new("Forked Viper" if twin else "Hourfall Viper", mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = arm
    modifier = obj.modifiers.new("Spine", "ARMATURE")
    modifier.object = arm
    groups = {name: obj.vertex_groups.new(name=name) for name, *_ in bones if name != "Root"}
    for i, joints in enumerate(weights):
        for name, weight in joints.items():
            if weight > 0:
                groups[name].add([i], weight, "REPLACE")

    clips = [("idle", "Snake_Idle", 2.8), ("walk", "Snake_Walk", 1.0), ("attack", "Snake_Attack", 0.8)]
    if twin:
        clips.extend([("spit", "Snake_Spit", 1.0), ("crush", "Snake_Crush", 1.0)])
    for mode, name, duration in clips:

        def pose(time: float) -> dict:
            t = time / duration
            curve = pose_curve("idle" if mode == "spit" else mode, t, rest)
            result = {}
            for side in sides:
                target_curve = neck_curve(curve, side, mode, t, fork)
                for i, s in enumerate(SPINE):
                    if side == 1 and s <= fork:
                        continue
                    p, q = frame(target_curve, s)
                    p0, q0 = frame(rest_curves[side], s)
                    bone = joint(i, side)
                    result[bone] = (move(arm, bone, p - p0), world_turn(arm, bone, q @ q0.inverted()))
                _, head_turn = frame(rest_curves[side], HINGE)
                active = (mode == "attack" and side <= 0) or (mode == "spit" and side > 0)
                gape = ease(0.21, 0.43, t) * (1 - ease(0.50, 0.73, t)) if active else 0
                jaw = branch_name("Jaw", side)
                fangs = branch_name("Fangs", side)
                result[jaw] = (Vector(), world_turn(arm, jaw, Quaternion(head_turn @ X, 0.76 * gape)))
                result[fangs] = (Vector(), world_turn(arm, fangs, Quaternion(head_turn @ X, -1.14 * gape)))
            return result

        clip(arm, name, duration, pose)
    export(arm, str(target))


if __name__ == "__main__":
    with TemporaryDirectory() as directory:
        args = sys.argv[sys.argv.index("--") + 1 :]
        build(Path(args[0]).resolve(), Path(directory), "--twin" in args[1:])
