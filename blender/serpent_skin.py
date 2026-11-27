import struct
import zlib
from pathlib import Path

import numpy as np


def ramp(low: float, high: float, value: np.ndarray) -> np.ndarray:
    t = np.clip((value - low) / (high - low), 0, 1)
    return t * t * (3 - 2 * t)


def mix(base: np.ndarray, colour: list | np.ndarray, mask: np.ndarray) -> np.ndarray:
    return base + (np.asarray(colour) - base) * mask[..., None]


def fleck(x: np.ndarray, y: np.ndarray, seed: int) -> np.ndarray:
    h = np.sin(x * 127.1 + y * 311.7 + seed * 71.3) * 43758.5453
    return h - np.floor(h)


def noise(x: np.ndarray, y: np.ndarray, seed: int) -> np.ndarray:
    i, j = np.floor(x), np.floor(y)
    a, b = ramp(0, 1, x - i), ramp(0, 1, y - j)
    return ((1 - a) * fleck(i, j, seed) + a * fleck(i + 1, j, seed)) * (1 - b) + (
        (1 - a) * fleck(i, j + 1, seed) + a * fleck(i + 1, j + 1, seed)
    ) * b


def write_png(path: Path, pixels: np.ndarray) -> None:
    height, width, _ = pixels.shape

    def chunk(name: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + name + data + struct.pack(">I", zlib.crc32(name + data))

    rows = b"".join(b"\0" + row.tobytes() for row in np.uint8(np.clip(pixels, 0, 255)))
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">2I5B", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(rows, 6))
        + chunk(b"IEND", b"")
    )


def scale_field(s: np.ndarray, v: np.ndarray, cheek: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    row = v * 28 + 0.25 * np.sin(s * 21) * np.sin(2 * np.pi * v)
    col = s * 87 + 0.48 * np.sin(row * np.pi / 14) + noise(s * 18, v * 12, 2) * 0.36
    best = np.full_like(s, 9.0)
    owner = np.zeros_like(s)
    ridge = np.zeros_like(s)
    for offset in (-1, 0, 1):
        j = np.floor(row) + offset
        shifted = col - 0.5 * (j % 2)
        i = np.floor(shifted + 0.5)
        dx = shifted - i + 0.08 * (fleck(i, j, 6) - 0.5)
        dy = row - j + 0.12 * (fleck(i, j, 4) - 0.5)
        dist = (dx * 1.7) ** 2 + (dy * (1.5 + 0.52 * dx)) ** 2
        inside = dist < best
        keel = np.exp(-((dy * 7) ** 2)) * np.maximum(0, 1 - abs(dx) * 2)
        ridge = np.where(inside, keel, ridge)
        owner = np.where(inside, fleck(i, j, 3), owner)
        best = np.minimum(dist, best)
    tile = 1 - ramp(0.43, 0.72, best)
    return tile, ridge * (1 - cheek * 0.7), owner


def maps(directory: Path, twin: bool = False) -> tuple[Path, Path]:
    width, height = 1024, 512
    u, v = np.meshgrid((np.arange(width) + 0.5) / width, 1 - (np.arange(height) + 0.5) / height)
    s = np.where(u <= 0.70, u / 0.70 * 0.865, 0.865 + (u - 0.70) / 0.27 * 0.135)
    side = abs(2 * v - 1)
    belly = ramp(0.64, 0.79, side)
    head = ramp(0.865, 0.905, s)
    rough = noise(s * 87, v * 28, 1)
    dapple = noise(s * 37, v * 19, 4)
    mottling = noise(s * 15, v * 6, 9)
    tile, keel, variation = scale_field(s, v, head)
    base = mix(np.array([118, 114, 90]), [168, 151, 117], mottling)
    grain = noise(s * 360, v * 141, 8)
    speck = noise(s * 143, v * 59, 6)

    phase = (
        s * 13
        + 0.17 * np.sin(s * 29)
        + 0.22 * (v - 0.5)
        + 0.16 * (dapple - 0.5)
        + 0.32 * (mottling - 0.5)
        + 0.095 * (variation - 0.5)
    )
    lozenge = (
        abs((phase + 0.5) % 1 - 0.5) * 1.9
        + (side / (0.52 + 0.15 * (mottling - 0.5))) ** 1.35
        + 0.12 * (variation - 0.5)
    )
    edge = (1 - head) * (1 - ramp(0.87, 0.99, lozenge))
    base = mix(base, [183, 164, 128], edge * 0.84)
    base = mix(base, [65, 58, 48], (1 - head) * (1 - ramp(0.71, 0.81, lozenge)))
    base = mix(base, [94, 79, 54], (1 - head) * (1 - ramp(0.42, 0.65, lozenge)) * (0.5 + rough * 0.35))
    blotch = ((abs((phase + 0.02) % 1 - 0.5)) / 0.26) ** 2 + ((side - 0.51) / 0.105) ** 2
    base = mix(base, [88, 73, 51], (1 - ramp(0.71, 1.18, blotch)) * (1 - head))
    base = mix(base, [189, 170, 133], belly * (0.81 + 0.12 * rough))
    if twin:
        copper = (1 - head) * (1 - belly) * (0.38 + 0.32 * mottling)
        base = mix(base, base * np.array([1.10, 0.79, 0.67]), copper)
        collar = (1 - ramp(0.018, 0.064, abs(side - 0.27))) * ramp(0.65, 0.73, s) * (1 - ramp(0.86, 0.92, s))
        base = mix(base, [202, 167, 110], collar * 0.74)
    crown = np.abs(side - (0.10 + (s - 0.89) * 3.3))
    base = mix(base, [75, 66, 49], head * (1 - ramp(0.04, 0.084, crown)) * (1 - ramp(0.953, 0.977, s)))
    eye_s, eye_side = 0.951, 0.394
    stripe = abs(side - (eye_side + (eye_s - s) * 1.75))
    stripe_end = ramp(0.887, 0.908, s) * (1 - ramp(0.963, 0.986, s))
    base = mix(base, [199, 180, 135], stripe_end * (1 - ramp(0.077, 0.103, stripe)))
    base = mix(base, [56, 49, 38], stripe_end * (1 - ramp(0.053, 0.075, stripe)))
    lip = head * ramp(0.47, 0.56, side) * (1 - ramp(0.77, 0.85, side))
    base = mix(base, [201, 184, 148], lip * 0.88)
    shields = np.abs((s * 80 + side * 2.8) % 1 - 0.5)
    base = mix(base, [119, 102, 77], lip * (1 - ramp(0.035, 0.092, shields)) * 0.79)
    scale_detail = ((tile - 0.68) * 39 + keel * 12 + (variation - 0.5) * 35) * (1 - belly) * (1 - lip * 0.77)
    ventral = ramp(0.07, 0.35, (s * 77 + 0.38 * (1 - side) ** 2) % 1)
    base += (
        scale_detail
        + (ventral - 0.75) * belly * 22
        + (dapple - 0.5) * 17
        + (rough - 0.5) * 14
        + (grain - 0.5) * 12
        + (speck - 0.5) * 21
    )[..., None]
    relief = (tile * 0.42 + keel * 0.28) * (1 - belly) * (1 - lip * 0.8) + ventral * belly * 0.4

    crown_plate = head * (1 - ramp(0.50, 0.63, side)) * (1 - ramp(0.982, 1.0, s))
    plate_x = (s - 0.873) * 100 + 0.28 * np.cos(side * 15)
    plate_y = side * 12 + 1.9 * (s - 0.95)
    seams = np.minimum(abs((plate_x + 0.5 * (np.floor(plate_y) % 2)) % 1 - 0.5) * 2, abs(plate_y % 1 - 0.5) * 2)
    boundary = 1 - ramp(0.012, 0.078, seams)
    base = mix(base, [78, 68, 51], crown_plate * boundary * 0.51)
    relief -= crown_plate * boundary * 0.46
    ex, ey = (s - eye_s) / 0.0067, (side - eye_side) / 0.056
    radius = np.sqrt(ex**2 + ey**2)
    base = mix(base, [46, 38, 28], 1 - ramp(1.02, 1.15, radius))
    iris = np.stack([135 + 39 * speck, 103 + 28 * speck, 66 + 22 * speck], axis=-1)
    base = mix(base, iris, 1 - ramp(0.80, 0.98, radius))
    pupil = (ex / 0.20) ** 2 + (ey / 0.86) ** 2
    base = mix(base, [24, 23, 20], 1 - ramp(0.65, 1.15, pupil))
    glint = ((ex - 0.30) / 0.14) ** 2 + ((ey + 0.38) / 0.15) ** 2
    base = mix(base, [234, 219, 175], (1 - ramp(0.5, 1.3, glint)) * 0.7)
    relief = np.where(radius < 1.1, 0.67 * np.maximum(0, 1 - (radius / 1.1) ** 2), relief)
    for position, latitude, length, depth in ((0.984, 0.343, 0.0032, 0.023), (0.970, 0.493, 0.0023, 0.015)):
        r = ((s - position) / length) ** 2 + ((side - latitude) / depth) ** 2
        base = mix(base, [48, 42, 32], 1 - ramp(0.65, 1.35, r))
        relief -= (1 - ramp(0.65, 1.35, r)) * 0.65
    line = (1 - ramp(0.004, 0.023, abs(side - 0.6))) * ramp(0.91, 0.93, s)
    base = mix(base, [57, 44, 34], line * 0.77)
    rostral = ramp(0.988, 0.998, s) * (1 - ramp(0.997, 1.0, s) * 0.1)
    base = mix(base, [164, 146, 111], rostral * 0.85)
    base += (grain - 0.5)[..., None] * rostral[..., None] * 12
    relief *= 1 - rostral * 0.88
    throat = ramp(0.978, 0.997, u) * (0.73 + 0.27 * np.cos((v - 0.398) * 62))
    inside = mix(np.array([65, 40, 41]), [148, 99, 90], throat)
    inside += (8 * np.sin(19 * v) + 3 * (grain - 0.5))[..., None]
    base[u > 0.972] = inside[u > 0.972]
    base[(u > 0.974) & (v > 0.65)] = [208, 193, 153]
    relief[u > 0.972] = 0
    dy, dx = np.gradient(relief)
    normal = np.stack([-dx * 2.1, dy * 2.1, np.ones_like(dx)], axis=-1)
    normal /= np.linalg.norm(normal, axis=-1)[..., None]
    colour_path, normal_path = directory / "adder-pigment.png", directory / "adder-scales.png"
    write_png(colour_path, base)
    write_png(normal_path, 127.5 * (normal + 1))
    return colour_path, normal_path
