import type { BeamDelivery, BlinkDelivery, ChainDelivery } from '../content/shape-types.ts';
import type { SkillDef } from '../content/types.ts';
import type { ReadonlyVec2, Vec2 } from '../math.ts';
import { dot, normalize } from '../math.ts';
import { isSolid, isWalkable, lineOfSight } from '../nav/grid.ts';
import { applyHit, targetsOf } from './combat.ts';
import type { Actor, Offence, World } from './types.ts';

export const SHAPES = {
  beamProbe: 0.25,
  beamOrigin: 0.6,
} as const;

export function scaledDamage(skill: SkillDef, scale: number): SkillDef {
  if (scale === 1) return skill;
  return { ...skill, damage: { ...skill.damage, weaponPercent: skill.damage.weaponPercent * scale, flatMin: skill.damage.flatMin * scale, flatMax: skill.damage.flatMax * scale } };
}

function gapTo(from: ReadonlyVec2, target: Actor): number {
  return Math.hypot(target.pos.x - from.x, target.pos.z - from.z) - target.radius;
}

function closest(world: World, candidates: readonly Actor[], from: ReadonlyVec2, near: ReadonlyVec2, reach: number): Actor | null {
  let best: Actor | null = null;
  let bestGap: number = Infinity;
  for (const target of candidates) {
    if (gapTo(from, target) > reach || !lineOfSight(world.grid, from, target.pos)) continue;
    const gap: number = gapTo(near, target);
    if (gap < bestGap) {
      bestGap = gap;
      best = target;
    }
  }
  return best;
}

export function resolveChain(world: World, from: ReadonlyVec2, skill: SkillDef, delivery: ChainDelivery, aim: ReadonlyVec2, offence: Offence): number {
  const origin: Vec2 = { x: from.x, z: from.z };
  const points: Vec2[] = [origin];
  let candidates: Actor[] = targetsOf(world, offence);
  let current: Actor | null = closest(world, candidates, origin, aim, delivery.range);
  let hits: number = 0;
  let scale: number = 1;
  let last: ReadonlyVec2 = origin;
  for (let link: number = 0; link <= delivery.jumps && current !== null; link += 1) {
    const struck: Actor = current;
    points.push({ x: struck.pos.x, z: struck.pos.z });
    const toward: Vec2 = normalize({ x: struck.pos.x - last.x, z: struck.pos.z - last.z }, { x: 0, z: 1 });
    if (applyHit(world, offence, struck, scaledDamage(skill, scale), toward)) hits += 1;
    candidates = candidates.filter((candidate: Actor): boolean => candidate !== struck && candidate.alive);
    last = { x: struck.pos.x, z: struck.pos.z };
    scale *= delivery.falloff;
    current = closest(world, candidates, last, last, delivery.jumpRange);
  }
  if (points.length === 1) points.push({ x: aim.x, z: aim.z });
  world.events.push({ type: 'chain', actorId: offence.sourceId, team: offence.team, skill, points });
  return hits;
}

function beamEnd(world: World, from: ReadonlyVec2, direction: ReadonlyVec2, range: number): number {
  let reach: number = 0;
  while (reach < range) {
    const next: number = Math.min(range, reach + SHAPES.beamProbe);
    if (isSolid(world.grid, from.x + direction.x * next, from.z + direction.z * next)) return reach;
    reach = next;
  }
  return reach;
}

export function resolveBeam(world: World, origin: ReadonlyVec2, skill: SkillDef, delivery: BeamDelivery, direction: ReadonlyVec2, offence: Offence): number {
  const from: Vec2 = { x: origin.x + direction.x * SHAPES.beamOrigin, z: origin.z + direction.z * SHAPES.beamOrigin };
  const length: number = beamEnd(world, from, direction, delivery.range);
  let hits: number = 0;
  for (const target of targetsOf(world, offence)) {
    const offset: Vec2 = { x: target.pos.x - from.x, z: target.pos.z - from.z };
    const along: number = dot(offset, direction);
    const across: number = Math.abs(offset.x * direction.z - offset.z * direction.x);
    if (along < -target.radius || along > length + target.radius || across > delivery.width / 2 + target.radius) continue;
    if (applyHit(world, offence, target, skill, direction)) hits += 1;
  }
  world.events.push({ type: 'beam', actorId: offence.sourceId, team: offence.team, skill, from, to: { x: from.x + direction.x * length, z: from.z + direction.z * length }, hits });
  return hits;
}

export function resolveBlink(world: World, mover: Actor | null, origin: ReadonlyVec2, skill: SkillDef, delivery: BlinkDelivery, target: ReadonlyVec2 | null, offence: Offence): number {
  const from: Vec2 = { x: origin.x, z: origin.z };
  const reached: boolean = target !== null && isWalkable(world.grid, target.x, target.z) && lineOfSight(world.grid, from, target);
  const arrival: Vec2 = target !== null && reached ? { x: target.x, z: target.z } : from;
  if (mover !== null) {
    mover.pos.x = arrival.x;
    mover.pos.z = arrival.z;
    world.events.push({ type: 'blink', actorId: mover.id, skill, from, to: { x: arrival.x, z: arrival.z } });
  }
  if (delivery.radius <= 0) return 0;
  let hits: number = 0;
  for (const struck of targetsOf(world, offence)) {
    const offset: Vec2 = { x: struck.pos.x - arrival.x, z: struck.pos.z - arrival.z };
    if (Math.hypot(offset.x, offset.z) > delivery.radius + struck.radius) continue;
    if (applyHit(world, offence, struck, skill, normalize(offset, { x: 0, z: 1 }))) hits += 1;
  }
  return hits;
}
