import type { AreaDelivery } from '../content/shape-types.ts';
import type { SkillDef } from '../content/types.ts';
import type { ReadonlyVec2, Vec2 } from '../math.ts';
import { dot } from '../math.ts';
import { moveWithCollision } from '../nav/grid.ts';
import { launchPoint } from './wards.ts';
import { gridFor } from './movement.ts';
import { applyHit, findActor, targetsWhere } from './combat.ts';
import { isDashing, rollsSteady } from './dash.ts';
import { steadiness } from './poise.ts';
import { sameFloor } from './floors.ts';
import { beamEnd } from './shapes.ts';
import { dropAura, raiseAura, replacedAuras } from './aura.ts';
import type { Actor, AreaState, Offence, Team, World } from './types.ts';

export const AREAS = {
  pullStop: 0.6,
  settle: 1e-6,
  facing: { x: 0, z: 1 },
} as const;

export function areaOf(skill: SkillDef): AreaDelivery | null {
  return skill.delivery.type === 'area' ? skill.delivery : null;
}

export function placeArea(world: World, offence: Offence, skill: SkillDef, at: ReadonlyVec2, toward: ReadonlyVec2 = AREAS.facing, span: number | null = null): AreaState | null {
  const delivery: AreaDelivery | null = areaOf(skill);
  if (delivery === null) return null;
  for (const replaced of replacedAuras(world, offence.sourceId, skill)) endArea(world, replaced);
  const length: number = delivery.length > 0 ? (span ?? delivery.length) : 0;
  const reach: number = length > 0 ? beamEnd(world, at, toward, length) : 0;
  const area: AreaState = { id: world.nextId, ownerId: offence.sourceId, from: launchPoint(world, offence.sourceId, { x: at.x, z: at.z }), skill, offence, pos: { x: at.x, z: at.z }, toward: { x: toward.x, z: toward.z }, reach, timeLeft: delivery.duration, pulseLeft: delivery.pulse, pulses: 0 };
  world.nextId += 1;
  world.areas.push(area);
  world.events.push({ type: 'area', area, stage: 'start', hits: 0 });
  raiseAura(world, area);
  if (delivery.opening) pulse(world, area, delivery);
  return area;
}

function endArea(world: World, area: AreaState): void {
  world.areas = world.areas.filter((other: AreaState): boolean => other !== area);
  world.events.push({ type: 'area', area, stage: 'end', hits: 0 });
  dropAura(world, area);
}

export function areaCovers(area: AreaState, delivery: AreaDelivery, pos: ReadonlyVec2, radius: number): boolean {
  const offset: Vec2 = { x: pos.x - area.pos.x, z: pos.z - area.pos.z };
  if (delivery.length === 0) return Math.hypot(offset.x, offset.z) <= delivery.radius + radius;
  const along: number = dot(offset, area.toward);
  const across: number = Math.abs(offset.x * area.toward.z - offset.z * area.toward.x);
  return along >= -radius && along <= area.reach + radius && across <= delivery.radius + radius;
}

function covers(world: World, area: AreaState, delivery: AreaDelivery, pos: ReadonlyVec2, radius: number): boolean {
  return areaCovers(area, delivery, pos, radius) && sameFloor(world, area.pos, pos);
}

export function timeScaleAt(world: World, team: Team, pos: ReadonlyVec2, radius: number): number {
  let scale: number = 1;
  for (const area of world.areas) {
    const delivery: AreaDelivery | null = areaOf(area.skill);
    if (delivery === null || area.offence.team === team || !covers(world, area, delivery, pos, radius)) continue;
    scale = Math.min(scale, delivery.slow);
  }
  return scale;
}

export function timeScaleOf(world: World, actor: Actor): number {
  return timeScaleAt(world, actor.kind, actor.pos, actor.radius);
}

function pull(world: World, area: AreaState, delivery: AreaDelivery, dt: number): void {
  if (delivery.pull <= 0) return;
  for (const target of targetsWhere(world, { sourceId: area.offence.sourceId, faction: area.offence.faction, from: area.from }, (actor: Actor): boolean => covers(world, area, delivery, actor.pos, actor.radius))) {
    if (!covers(world, area, delivery, target.pos, target.radius) || (target.action !== null && !isDashing(target)) || rollsSteady(target)) continue;
    const offset: Vec2 = { x: area.pos.x - target.pos.x, z: area.pos.z - target.pos.z };
    const gap: number = Math.hypot(offset.x, offset.z);
    const step: number = Math.min(delivery.pull * steadiness(target) * dt, gap - AREAS.pullStop);
    if (step <= 0) continue;
    moveWithCollision(gridFor(world, target), target.pos, (offset.x / gap) * step, (offset.z / gap) * step);
    target.motion = 'pulled';
  }
}

export function stokeHeat(delivery: AreaDelivery, pulses: number): number {
  if (delivery.stoke === null) return 0;
  return Math.min(delivery.stoke.max, delivery.stoke.perPulse * pulses);
}

export function stokedOffence(area: AreaState, delivery: AreaDelivery): Offence {
  if (delivery.stoke === null || area.pulses === 0) return area.offence;
  const heat: number = stokeHeat(delivery, area.pulses);
  return { ...area.offence, damagePercent: (1 + area.offence.damagePercent) * (1 + heat) - 1 };
}

export function areaAxisPoint(area: AreaState, delivery: AreaDelivery, pos: ReadonlyVec2): Vec2 {
  if (delivery.length === 0) return { x: area.pos.x, z: area.pos.z };
  const along: number = Math.min(area.reach, Math.max(0, dot({ x: pos.x - area.pos.x, z: pos.z - area.pos.z }, area.toward)));
  return { x: area.pos.x + area.toward.x * along, z: area.pos.z + area.toward.z * along };
}

function awayFrom(area: AreaState, delivery: AreaDelivery, pos: ReadonlyVec2): Vec2 {
  const axis: Vec2 = areaAxisPoint(area, delivery, pos);
  const offset: Vec2 = { x: pos.x - axis.x, z: pos.z - axis.z };
  const gap: number = Math.hypot(offset.x, offset.z);
  return gap > 0 ? { x: offset.x / gap, z: offset.z / gap } : { x: area.toward.x, z: area.toward.z };
}

function pulse(world: World, area: AreaState, delivery: AreaDelivery): void {
  const offence: Offence = stokedOffence(area, delivery);
  let hits: number = 0;
  for (const target of targetsWhere(world, { sourceId: area.offence.sourceId, faction: area.offence.faction, from: area.from }, (actor: Actor): boolean => covers(world, area, delivery, actor.pos, actor.radius))) {
    if (!covers(world, area, delivery, target.pos, target.radius)) continue;
    if (applyHit(world, offence, target, area.skill, awayFrom(area, delivery, target.pos))) hits += 1;
  }
  area.pulses += 1;
  world.events.push({ type: 'area', area, stage: 'pulse', hits });
}

function stepArea(world: World, area: AreaState, dt: number): boolean {
  const delivery: AreaDelivery | null = areaOf(area.skill);
  if (delivery === null) return false;
  if (delivery.anchor === 'caster') {
    const owner: Actor | null = findActor(world, area.ownerId);
    if (owner === null || !owner.alive) {
      world.events.push({ type: 'area', area, stage: 'end', hits: 0 });
      dropAura(world, area);
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
  dropAura(world, area);
  return false;
}

export function stepAreas(world: World, dt: number): void {
  world.areas = world.areas.filter((area: AreaState): boolean => stepArea(world, area, dt));
}

export function clearAreas(world: World): void {
  const cleared: readonly AreaState[] = world.areas;
  world.areas = [];
  for (const area of cleared) dropAura(world, area);
}
