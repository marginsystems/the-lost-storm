import type { AreaDelivery } from '../content/shape-types.ts';
import type { SkillDef } from '../content/types.ts';
import type { ReadonlyVec2, Vec2 } from '../math.ts';
import { moveWithCollision } from '../nav/grid.ts';
import { applyHit, findActor, targetsOf } from './combat.ts';
import { steadiness } from './poise.ts';
import type { Actor, AreaState, Offence, Team, World } from './types.ts';

export const AREAS = {
  pullStop: 0.6,
  settle: 1e-6,
} as const;

export function areaOf(skill: SkillDef): AreaDelivery | null {
  return skill.delivery.type === 'area' ? skill.delivery : null;
}

export function placeArea(world: World, offence: Offence, skill: SkillDef, at: ReadonlyVec2): AreaState | null {
  const delivery: AreaDelivery | null = areaOf(skill);
  if (delivery === null) return null;
  const area: AreaState = { id: world.nextId, ownerId: offence.sourceId, skill, offence, pos: { x: at.x, z: at.z }, timeLeft: delivery.duration, pulseLeft: delivery.pulse };
  world.nextId += 1;
  world.areas.push(area);
  world.events.push({ type: 'area', area, stage: 'start', hits: 0 });
  return area;
}

function covers(area: AreaState, delivery: AreaDelivery, pos: ReadonlyVec2, radius: number): boolean {
  return Math.hypot(pos.x - area.pos.x, pos.z - area.pos.z) <= delivery.radius + radius;
}

export function timeScaleAt(world: World, team: Team, pos: ReadonlyVec2, radius: number): number {
  let scale: number = 1;
  for (const area of world.areas) {
    const delivery: AreaDelivery | null = areaOf(area.skill);
    if (delivery === null || area.offence.team === team || !covers(area, delivery, pos, radius)) continue;
    scale = Math.min(scale, delivery.slow);
  }
  return scale;
}

export function timeScaleOf(world: World, actor: Actor): number {
  return timeScaleAt(world, actor.kind, actor.pos, actor.radius);
}

function pull(world: World, area: AreaState, delivery: AreaDelivery, dt: number): void {
  if (delivery.pull <= 0) return;
  for (const target of targetsOf(world, area.offence)) {
    if (!covers(area, delivery, target.pos, target.radius)) continue;
    const offset: Vec2 = { x: area.pos.x - target.pos.x, z: area.pos.z - target.pos.z };
    const gap: number = Math.hypot(offset.x, offset.z);
    const step: number = Math.min(delivery.pull * steadiness(target) * dt, gap - AREAS.pullStop);
    if (step <= 0) continue;
    moveWithCollision(world.grid, target.pos, (offset.x / gap) * step, (offset.z / gap) * step);
  }
}

function pulse(world: World, area: AreaState, delivery: AreaDelivery): void {
  let hits: number = 0;
  for (const target of targetsOf(world, area.offence)) {
    if (!covers(area, delivery, target.pos, target.radius)) continue;
    const offset: Vec2 = { x: target.pos.x - area.pos.x, z: target.pos.z - area.pos.z };
    const gap: number = Math.hypot(offset.x, offset.z);
    const away: Vec2 = gap > 0 ? { x: offset.x / gap, z: offset.z / gap } : { x: 0, z: 1 };
    if (applyHit(world, area.offence, target, area.skill, away)) hits += 1;
  }
  world.events.push({ type: 'area', area, stage: 'pulse', hits });
}

function stepArea(world: World, area: AreaState, dt: number): boolean {
  const delivery: AreaDelivery | null = areaOf(area.skill);
  if (delivery === null) return false;
  if (delivery.anchor === 'caster') {
    const owner: Actor | null = findActor(world, area.ownerId);
    if (owner === null || !owner.alive) {
      world.events.push({ type: 'area', area, stage: 'end', hits: 0 });
      return false;
    }
    area.pos.x = owner.pos.x;
    area.pos.z = owner.pos.z;
  }
  area.timeLeft -= dt;
  pull(world, area, delivery, dt);
  if (delivery.pulse > 0) {
    area.pulseLeft -= dt;
    while (area.pulseLeft <= AREAS.settle && area.timeLeft - area.pulseLeft > -AREAS.settle) {
      pulse(world, area, delivery);
      area.pulseLeft += delivery.pulse;
    }
  }
  if (area.timeLeft > AREAS.settle) return true;
  world.events.push({ type: 'area', area, stage: 'end', hits: 0 });
  return false;
}

export function stepAreas(world: World, dt: number): void {
  world.areas = world.areas.filter((area: AreaState): boolean => stepArea(world, area, dt));
}

export function clearAreas(world: World): void {
  world.areas = [];
}
