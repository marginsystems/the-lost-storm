import math

import numpy as np


def branch_name(name: str, side: int) -> str:
    return name if side == 0 else f"{name}_{'Bite' if side < 0 else 'Venom'}"


def neck_curve(curve: tuple, side: int, mode: str, time: float, fork: float) -> tuple:
    if side == 0:
        return curve
    s, x, y, height, bearing, rest_pitch = curve
    blend = np.clip((s - fork) / (s[-1] - fork), 0, 1)
    lead = np.clip(blend * 5, 0, 1)
    lead = lead * lead * (3 - 2 * lead)
    phase = 2 * math.pi * time
    watch = 0.13 * math.sin(phase + 0.6 * side) if mode in ("idle", "walk") else 0
    action = (side < 0 and mode == "attack") or (side > 0 and mode == "spit")
    cue = math.sin(math.pi * time) ** 6 if action else 0
    aim = bearing * (1 - lead) + lead * (side * (1.19 - 0.85 * blend**2) + 0.19 + watch - side * 0.18 * cue)
    rise = height + lead * blend * (
        (0.24 if side > 0 else 0.035) + 0.018 * watch + (0.075 if mode == "spit" else -0.05) * cue
    )
    if mode == "crush":
        contact = np.interp(time, [0, 0.36, 0.50, 0.58, 1], [0, 0, 1, 1, 0])
        rise -= lead * blend * (0.22 if side > 0 else 0.03) * contact
    old_length = np.sqrt(np.diff(x) ** 2 + np.diff(y) ** 2 + np.diff(height) ** 2)
    step = np.sqrt(np.maximum(0, old_length**2 - np.diff(rise) ** 2))
    direction = 0.5 * (aim[1:] + aim[:-1])
    nx = x[0] + np.r_[0, np.cumsum(np.sin(direction) * step)]
    ny = y[0] + np.r_[0, np.cumsum(-np.cos(direction) * step)]
    start = int(np.argmin(abs(s - fork)))
    nx += x[start] - nx[start]
    ny += y[start] - ny[start]
    nx[: start + 1], ny[: start + 1] = x[: start + 1], y[: start + 1]
    pitch = np.arctan2(np.gradient(rise), np.hypot(np.gradient(nx), np.gradient(ny)))
    pitch[: start + 1] = rest_pitch[: start + 1]
    return s, nx, ny, rise, aim, pitch
