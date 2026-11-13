import json
from pathlib import Path

import bpy
from bpy.types import Object
from mathutils import Matrix

RIG_NAME: str = "Rig"
WEAPON_NAME: str = "Weapon"
SUFFIX: str = "-pose.json"


def rows(matrix: Matrix) -> list[list[float]]:
    return [list(row) for row in matrix]


def save_hold_pose() -> Path:
    blend: Path = Path(bpy.data.filepath)
    if not bpy.data.filepath:
        raise RuntimeError("save the .blend first: the pose is written beside it")
    rig: Object | None = bpy.data.objects.get(RIG_NAME)
    if rig is None or rig.type != "ARMATURE":
        raise RuntimeError(f"no armature called {RIG_NAME}")
    weapon: Object | None = bpy.data.objects.get(WEAPON_NAME)
    bpy.context.view_layer.update()
    out: dict[str, object] = {
        "note": f"Saved from {blend.name}. Blender Z-up.",
        "rig_matrix_world": rows(rig.matrix_world),
        "bones_world": {bone.name: rows(rig.matrix_world @ bone.matrix) for bone in rig.pose.bones},
        "bones_basis": {bone.name: list(bone.rotation_quaternion) for bone in rig.pose.bones},
    }
    if weapon is not None:
        out["gun"] = {"name": weapon.name, "matrix_world": rows(weapon.matrix_world)}
    path: Path = blend.with_name(blend.stem + SUFFIX)
    path.write_text(json.dumps(out, indent=1))
    print(f"saved {path}")
    return path


save_hold_pose()
