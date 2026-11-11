export interface Vec2 {
  x: number;
  z: number;
}

export type ReadonlyVec2 = Readonly<Vec2>;

export const DEGREES_TO_RADIANS: number = Math.PI / 180;

export function vec(x: number, z: number): Vec2 {
  return { x, z };
}

export function add(a: ReadonlyVec2, b: ReadonlyVec2): Vec2 {
  return { x: a.x + b.x, z: a.z + b.z };
}

export function sub(a: ReadonlyVec2, b: ReadonlyVec2): Vec2 {
  return { x: a.x - b.x, z: a.z - b.z };
}

export function scale(a: ReadonlyVec2, factor: number): Vec2 {
  return { x: a.x * factor, z: a.z * factor };
}

export function length(a: ReadonlyVec2): number {
  return Math.hypot(a.x, a.z);
}

export function distance(a: ReadonlyVec2, b: ReadonlyVec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function normalize(a: ReadonlyVec2, fallback: ReadonlyVec2): Vec2 {
  const size: number = length(a);
  if (size < 1e-6) return { x: fallback.x, z: fallback.z };
  return { x: a.x / size, z: a.z / size };
}

export function dot(a: ReadonlyVec2, b: ReadonlyVec2): number {
  return a.x * b.x + a.z * b.z;
}

export function rotate(a: ReadonlyVec2, radians: number): Vec2 {
  const cos: number = Math.cos(radians);
  const sin: number = Math.sin(radians);
  return { x: a.x * cos + a.z * sin, z: a.z * cos - a.x * sin };
}

export function facingOf(direction: ReadonlyVec2): number {
  return Math.atan2(direction.x, direction.z);
}

export function directionOf(facing: number): Vec2 {
  return { x: Math.sin(facing), z: Math.cos(facing) };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}
