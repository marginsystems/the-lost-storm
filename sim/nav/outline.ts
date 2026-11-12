import type { ReadonlyVec2 } from '../math.ts';

function cross(origin: ReadonlyVec2, a: ReadonlyVec2, b: ReadonlyVec2): number {
  return (a.x - origin.x) * (b.z - origin.z) - (a.z - origin.z) * (b.x - origin.x);
}

export function convexHull(points: readonly ReadonlyVec2[]): ReadonlyVec2[] {
  const sorted: ReadonlyVec2[] = points.toSorted((a: ReadonlyVec2, b: ReadonlyVec2): number => (a.x === b.x ? a.z - b.z : a.x - b.x));
  if (sorted.length < 3) return sorted;
  const lower: ReadonlyVec2[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2) ?? point, lower.at(-1) ?? point, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: ReadonlyVec2[] = [];
  for (const point of sorted.toReversed()) {
    while (upper.length >= 2 && cross(upper.at(-2) ?? point, upper.at(-1) ?? point, point) <= 0) upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function extended(before: ReadonlyVec2, from: ReadonlyVec2, to: ReadonlyVec2, after: ReadonlyVec2): ReadonlyVec2 | null {
  const denominator: number = (from.x - before.x) * (after.z - to.z) - (from.z - before.z) * (after.x - to.x);
  if (Math.abs(denominator) < 1e-12) return null;
  const t: number = ((to.x - before.x) * (after.z - to.z) - (to.z - before.z) * (after.x - to.x)) / denominator;
  if (t < 1) return null;
  return { x: before.x + (from.x - before.x) * t, z: before.z + (from.z - before.z) * t };
}

export function simplifyOutline(hull: readonly ReadonlyVec2[], most: number): ReadonlyVec2[] {
  let outline: ReadonlyVec2[] = [...hull];
  while (outline.length > most) {
    const count: number = outline.length;
    let best: { readonly index: number; readonly point: ReadonlyVec2; readonly grow: number } | null = null;
    for (let index: number = 0; index < count; index += 1) {
      const before: ReadonlyVec2 | undefined = outline[(index - 1 + count) % count];
      const from: ReadonlyVec2 | undefined = outline[index];
      const to: ReadonlyVec2 | undefined = outline[(index + 1) % count];
      const after: ReadonlyVec2 | undefined = outline[(index + 2) % count];
      if (before === undefined || from === undefined || to === undefined || after === undefined) continue;
      const point: ReadonlyVec2 | null = extended(before, from, to, after);
      if (point === null) continue;
      const grow: number = Math.abs(cross(from, to, point)) / 2;
      if (best === null || grow < best.grow) best = { index, point, grow };
    }
    if (best === null) break;
    const chosen: { readonly index: number; readonly point: ReadonlyVec2 } = best;
    const dropped: number = (chosen.index + 1) % count;
    outline = outline.flatMap((point: ReadonlyVec2, index: number): ReadonlyVec2[] => (index === chosen.index ? [chosen.point] : index === dropped ? [] : [point]));
  }
  return outline;
}

export function outlineGap(outline: readonly ReadonlyVec2[], x: number, z: number): number {
  let inside: boolean = true;
  let nearest: number = Infinity;
  for (let index: number = 0; index < outline.length; index += 1) {
    const from: ReadonlyVec2 | undefined = outline[index];
    const to: ReadonlyVec2 | undefined = outline[(index + 1) % outline.length];
    if (from === undefined || to === undefined) continue;
    const dx: number = to.x - from.x;
    const dz: number = to.z - from.z;
    const span: number = dx * dx + dz * dz;
    const t: number = span <= 0 ? 0 : Math.min(1, Math.max(0, ((x - from.x) * dx + (z - from.z) * dz) / span));
    nearest = Math.min(nearest, Math.hypot(x - (from.x + dx * t), z - (from.z + dz * t)));
    if (dx * (z - from.z) - dz * (x - from.x) < 0) inside = false;
  }
  return inside ? -nearest : nearest;
}
