import type { Vec2 } from '../math.ts';
import type { NavGrid } from '../nav/grid.ts';
import { isWalkable, lineWalkable } from '../nav/grid.ts';
import type { Rng } from '../rng.ts';
import { createRng } from '../rng.ts';
import type { Actor, PlayerState, World } from '../world/types.ts';
import { LAYOUT, MOVE_CHOICES, RL, SKILL_CHOICES } from './contract.ts';
import type { View } from './observe.ts';

export const CORNER = {
  drawSalt: 7727,
  tries: 600,
  wallReach: 3,
  walledRays: 9,
  openReach: 8,
  gap: { min: 4.5, max: 7 },
  turn: 0.6,
  skill: 'storm_bolt',
  slot: 1,
  casterSeat: 0,
  corneredSeat: 1,
  escape: 4,
  flee: 3,
  timeLimit: 15,
} as const;

export type CornerRole = 'caster' | 'cornered';

export function cornerRole(seat: number): CornerRole {
  return seat === CORNER.casterSeat ? 'caster' : 'cornered';
}

export interface CornerStart {
  readonly corner: Vec2;
  readonly caster: Vec2;
}

function rayAngle(ray: number): number {
  return (ray / RL.rays) * Math.PI * 2;
}

function clearReach(grid: NavGrid, from: Vec2, angle: number, reach: number): number {
  let clear: number = 0;
  while (clear < reach && isWalkable(grid, from.x + Math.cos(angle) * (clear + RL.rayStep), from.z + Math.sin(angle) * (clear + RL.rayStep))) clear += RL.rayStep;
  return clear;
}

export function walledRays(grid: NavGrid, at: Vec2): number {
  let walled: number = 0;
  for (let ray: number = 0; ray < RL.rays; ray += 1) if (clearReach(grid, at, rayAngle(ray), CORNER.wallReach) < CORNER.wallReach) walled += 1;
  return walled;
}

export function openDirection(grid: NavGrid, at: Vec2): Vec2 | null {
  let x: number = 0;
  let z: number = 0;
  for (let ray: number = 0; ray < RL.rays; ray += 1) {
    const angle: number = rayAngle(ray);
    const clear: number = clearReach(grid, at, angle, CORNER.openReach);
    x += Math.cos(angle) * clear;
    z += Math.sin(angle) * clear;
  }
  const length: number = Math.hypot(x, z);
  return length <= 0 ? null : { x: x / length, z: z / length };
}

export function isCorner(grid: NavGrid, at: Vec2): boolean {
  return isWalkable(grid, at.x, at.z) && walledRays(grid, at) >= CORNER.walledRays;
}

function casterSpot(grid: NavGrid, rng: Rng, corner: Vec2): Vec2 | null {
  const open: Vec2 | null = openDirection(grid, corner);
  if (open === null) return null;
  const angle: number = Math.atan2(open.z, open.x) + rng.range(-CORNER.turn, CORNER.turn);
  const gap: number = rng.range(CORNER.gap.min, CORNER.gap.max);
  const spot: Vec2 = { x: corner.x + Math.cos(angle) * gap, z: corner.z + Math.sin(angle) * gap };
  return isWalkable(grid, spot.x, spot.z) && lineWalkable(grid, corner, spot) ? spot : null;
}

export function findCorner(world: World, rng: Rng): CornerStart | null {
  const grid: NavGrid = world.grid;
  const width: number = grid.columns * grid.cellSize;
  const depth: number = grid.rows * grid.cellSize;
  for (let attempt: number = 0; attempt < CORNER.tries; attempt += 1) {
    const corner: Vec2 = { x: rng.range(0, width), z: rng.range(0, depth) };
    if (!isCorner(grid, corner)) continue;
    const caster: Vec2 | null = casterSpot(grid, rng, corner);
    if (caster !== null) return { corner, caster };
  }
  return null;
}

function apart(from: Vec2, to: Vec2): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

export function cornerEscaped(start: CornerStart, hero: Vec2, caster: Vec2): boolean {
  return apart(start.corner, hero) >= CORNER.escape && apart(hero, caster) <= apart(start.corner, start.caster);
}

export function cornerFled(start: CornerStart, hero: Vec2, caster: Vec2): boolean {
  return apart(hero, caster) > apart(start.corner, start.caster) + CORNER.flee;
}

export function cornerDrawn(seed: number, share: number): boolean {
  return share > 0 && createRng(seed + CORNER.drawSalt).next() < share;
}

function onlyChoice(mask: Uint8Array, from: number, count: number, choice: number): void {
  for (let index: number = 0; index < count; index += 1) mask[from + index] = index === choice ? 1 : 0;
}

export function casterMask(mask: Uint8Array, view: View, target: PlayerState): Uint8Array {
  const forced: Uint8Array = new Uint8Array(LAYOUT.mask);
  const bolt: number = CORNER.slot + 1;
  const aimed: number = view.targets.findIndex((actor: Actor): boolean => actor.id === target.id);
  onlyChoice(forced, 0, MOVE_CHOICES, 0);
  onlyChoice(forced, MOVE_CHOICES, SKILL_CHOICES, aimed >= 0 && mask[MOVE_CHOICES + bolt] === 1 ? bolt : 0);
  onlyChoice(forced, MOVE_CHOICES + SKILL_CHOICES, RL.targets, Math.max(0, Math.min(aimed, RL.targets - 1)));
  onlyChoice(forced, MOVE_CHOICES + SKILL_CHOICES + RL.targets, LAYOUT.mask - MOVE_CHOICES - SKILL_CHOICES - RL.targets, 0);
  return forced;
}
