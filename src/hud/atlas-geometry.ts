export interface Spot {
  readonly x: number;
  readonly y: number;
}

export type Rng = () => number;

const GEOMETRY = {
  tension: 6,
  mulberry: 0x6d2b79f5,
  uint: 4294967296,
  decimals: 1,
} as const;

export function seeded(seed: number): Rng {
  let state: number = seed >>> 0;
  return (): number => {
    state = (state + GEOMETRY.mulberry) >>> 0;
    let mixed: number = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / GEOMETRY.uint;
  };
}

export function fixed(value: number): string {
  return value.toFixed(GEOMETRY.decimals);
}

function at(points: readonly Spot[], index: number, closed: boolean): Spot {
  const count: number = points.length;
  const wrapped: number = closed ? ((index % count) + count) % count : Math.min(count - 1, Math.max(0, index));
  return points[wrapped] ?? { x: 0, y: 0 };
}

export function smoothPath(points: readonly Spot[], closed: boolean): string {
  if (points.length < 2) return '';
  const first: Spot = at(points, 0, closed);
  const parts: string[] = [`M${fixed(first.x)} ${fixed(first.y)}`];
  const spans: number = closed ? points.length : points.length - 1;
  for (let index: number = 0; index < spans; index += 1) {
    const before: Spot = at(points, index - 1, closed);
    const from: Spot = at(points, index, closed);
    const to: Spot = at(points, index + 1, closed);
    const after: Spot = at(points, index + 2, closed);
    const c1: Spot = { x: from.x + (to.x - before.x) / GEOMETRY.tension, y: from.y + (to.y - before.y) / GEOMETRY.tension };
    const c2: Spot = { x: to.x - (after.x - from.x) / GEOMETRY.tension, y: to.y - (after.y - from.y) / GEOMETRY.tension };
    parts.push(`C${fixed(c1.x)} ${fixed(c1.y)} ${fixed(c2.x)} ${fixed(c2.y)} ${fixed(to.x)} ${fixed(to.y)}`);
  }
  if (closed) parts.push('Z');
  return parts.join('');
}

export function roughen(points: readonly Spot[], closed: boolean, rng: Rng, amount: number, passes: number): Spot[] {
  let current: Spot[] = [...points];
  let reach: number = amount;
  for (let pass: number = 0; pass < passes; pass += 1) {
    const next: Spot[] = [];
    const spans: number = closed ? current.length : current.length - 1;
    for (let index: number = 0; index < spans; index += 1) {
      const from: Spot = at(current, index, closed);
      const to: Spot = at(current, index + 1, closed);
      const length: number = Math.hypot(to.x - from.x, to.y - from.y);
      const push: number = (rng() - 0.5) * 2 * reach * length;
      const normal: Spot = length === 0 ? { x: 0, y: 0 } : { x: -(to.y - from.y) / length, y: (to.x - from.x) / length };
      next.push(from, { x: (from.x + to.x) / 2 + normal.x * push, y: (from.y + to.y) / 2 + normal.y * push });
    }
    if (!closed) next.push(at(current, current.length - 1, false));
    current = next;
    reach /= 2;
  }
  return current;
}

export function inside(polygon: readonly Spot[], point: Spot): boolean {
  let within: boolean = false;
  for (let index: number = 0; index < polygon.length; index += 1) {
    const a: Spot = at(polygon, index, true);
    const b: Spot = at(polygon, index + 1, true);
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) within = !within;
  }
  return within;
}

export function along(points: readonly Spot[], spacing: number): Spot[] {
  const found: Spot[] = [];
  let owed: number = 0;
  for (let index: number = 0; index < points.length - 1; index += 1) {
    const from: Spot = at(points, index, false);
    const to: Spot = at(points, index + 1, false);
    const length: number = Math.hypot(to.x - from.x, to.y - from.y);
    if (length === 0) continue;
    let travelled: number = owed;
    for (; travelled <= length; travelled += spacing) found.push({ x: from.x + ((to.x - from.x) * travelled) / length, y: from.y + ((to.y - from.y) * travelled) / length });
    owed = travelled - length;
  }
  return found;
}

export function scatter(polygon: readonly Spot[], spacing: number, rng: Rng): Spot[] {
  const xs: number[] = polygon.map((point: Spot): number => point.x);
  const ys: number[] = polygon.map((point: Spot): number => point.y);
  const found: Spot[] = [];
  let row: number = 0;
  for (let y: number = Math.min(...ys); y <= Math.max(...ys); y += spacing) {
    const shift: number = row % 2 === 0 ? 0 : spacing / 2;
    for (let x: number = Math.min(...xs) + shift; x <= Math.max(...xs); x += spacing) {
      const spot: Spot = { x: x + (rng() - 0.5) * spacing * 0.7, y: y + (rng() - 0.5) * spacing * 0.7 };
      if (inside(polygon, spot)) found.push(spot);
    }
    row += 1;
  }
  return found;
}
