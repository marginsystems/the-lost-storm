import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import type { NavGrid } from '../nav/grid.ts';
import { isWalkable } from '../nav/grid.ts';
import { findPath } from '../nav/path.ts';

export const STICK = {
  seeThrough: 8,
  step: 0.25,
  detour: 2.5,
  reuse: 1.5,
  arrive: 0.5,
} as const;

export function pastBlocks(grid: NavGrid, from: Vec2, dest: Vec2): Vec2[] {
  const reach: number = distance(from, dest);
  const openings: Vec2[] = [];
  if (reach <= 0) return openings;
  const ux: number = (dest.x - from.x) / reach;
  const uz: number = (dest.z - from.z) / reach;
  let blocked: boolean = true;
  for (let along: number = reach; along <= reach + STICK.seeThrough; along += STICK.step) {
    const x: number = from.x + ux * along;
    const z: number = from.z + uz * along;
    const open: boolean = isWalkable(grid, x, z);
    if (open && blocked) openings.push({ x, z });
    blocked = !open;
  }
  return openings;
}

export function pathLength(from: Vec2, path: readonly Vec2[]): number {
  let total: number = 0;
  let at: Vec2 = from;
  for (const point of path) {
    total += distance(at, point);
    at = point;
  }
  return total;
}

export function aroundPath(grid: NavGrid, from: Vec2, past: Vec2): Vec2[] | null {
  const path: Vec2[] = findPath(grid, from, past);
  const end: Vec2 | undefined = path.at(-1);
  if (end === undefined || distance(end, past) > STICK.arrive) return null;
  return pathLength(from, path) <= distance(from, past) * STICK.detour ? path : null;
}

export function roundPast(grid: NavGrid, from: Vec2, openings: readonly Vec2[]): Vec2[] | null {
  for (const past of openings) {
    const path: Vec2[] | null = aroundPath(grid, from, past);
    if (path !== null) return path;
  }
  return null;
}

export function stillRound(path: readonly Vec2[], openings: readonly Vec2[]): boolean {
  const end: Vec2 | undefined = path.at(-1);
  return end !== undefined && openings.some((past: Vec2): boolean => distance(end, past) <= STICK.reuse);
}
