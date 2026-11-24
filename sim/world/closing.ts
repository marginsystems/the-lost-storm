import type { DuelClosing } from '../content/zone-types.ts';
import type { Vec2 } from '../math.ts';
import { moveWithCollision } from '../nav/grid.ts';
import type { PlayerState, World } from './types.ts';

export const CLOSING = {
  probe: 0.25,
  stuck: 0.01,
  tries: 400,
} as const;

export interface ClosingState {
  readonly centre: Vec2;
  readonly from: number;
  readonly to: number;
  readonly startsAt: number;
  readonly closesAt: number;
}

export function openClosing(rules: DuelClosing, a: Vec2, b: Vec2, start: number): ClosingState {
  const centre: Vec2 = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  const from: number = Math.max(rules.to, Math.hypot(a.x - b.x, a.z - b.z) / 2 + rules.margin);
  const startsAt: number = start + rules.after;
  return { centre, from, to: rules.to, startsAt, closesAt: startsAt + rules.over };
}

export function closingRadius(closing: ClosingState, time: number): number {
  if (time <= closing.startsAt) return closing.from;
  if (time >= closing.closesAt) return closing.to;
  const share: number = (time - closing.startsAt) / (closing.closesAt - closing.startsAt);
  return closing.from + (closing.to - closing.from) * share;
}

function holdInside(world: World, hero: PlayerState, closing: ClosingState, radius: number): void {
  const limit: number = Math.max(0, radius - hero.radius);
  let over: number = Math.hypot(hero.pos.x - closing.centre.x, hero.pos.z - closing.centre.z) - limit;
  for (let tries: number = 0; over > 0 && tries < CLOSING.tries; tries += 1) {
    const dx: number = closing.centre.x - hero.pos.x;
    const dz: number = closing.centre.z - hero.pos.z;
    const gap: number = Math.hypot(dx, dz);
    if (gap === 0) return;
    const step: number = Math.min(CLOSING.probe, over);
    const before: Vec2 = { x: hero.pos.x, z: hero.pos.z };
    moveWithCollision(world.grid, hero.pos, (dx / gap) * step, (dz / gap) * step);
    const moved: number = Math.hypot(hero.pos.x - before.x, hero.pos.z - before.z);
    if (moved < CLOSING.stuck) return;
    over = Math.hypot(hero.pos.x - closing.centre.x, hero.pos.z - closing.centre.z) - limit;
  }
}

export function keepInsideClosing(world: World): void {
  const closing: ClosingState | null = world.closing;
  if (closing === null || world.zone.duel === null) return;
  const radius: number = closingRadius(closing, world.time);
  for (const hero of world.heroes) if (hero.alive) holdInside(world, hero, closing, radius);
}
