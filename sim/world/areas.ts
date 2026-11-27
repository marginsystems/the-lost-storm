import type { AreaDelivery } from '../content/shape-types.ts';
import type { SkillDef } from '../content/types.ts';
import type { ReadonlyVec2, Vec2 } from '../math.ts';
import { DEGREES_TO_RADIANS, rotate } from '../math.ts';
import { moveWithCollision } from '../nav/grid.ts';
import { launchPoint } from './wards.ts';
import { gridFor } from './movement.ts';
import { applyHit, canReceiveHit, findActor, targetsWhere } from './combat.ts';
import { isDashing, rollsSteady } from './dash.ts';
import { steadiness } from './poise.ts';
import { sameFloor } from './floors.ts';
import { beamEnd } from './shapes.ts';
import { dropAura, raiseAura, replacedAuras } from './aura.ts';
import type { Actor, AreaState, ForkedLane, GroundLane, Offence, Team, World } from './types.ts';

export const AREAS = {
  pullStop: 0.6,
  settle: 1e-6,
  facing: { x: 0, z: 1 },
} as const;

interface ForkContact {
  readonly target: Actor;
  readonly fork: ForkedLane;
}

export function areaOf(skill: SkillDef): AreaDelivery | null {
  return skill.delivery.type === 'area' ? skill.delivery : null;
}

export function placeArea(world: World, offence: Offence, skill: SkillDef, at: ReadonlyVec2, toward: ReadonlyVec2 = AREAS.facing, span: number | null = null, fork?: ForkedLane): AreaState | null {
  return openArea(world, offence, skill, at, toward, span, fork)?.area ?? null;
}

export function openArea(world: World, offence: Offence, skill: SkillDef, at: ReadonlyVec2, toward: ReadonlyVec2, span: number | null = null, inheritedFork?: ForkedLane): { area: AreaState; hits: number } | null {
  const delivery: AreaDelivery | null = areaOf(skill);
  if (delivery === null) return null;
  for (const replaced of replacedAuras(world, offence.sourceId, skill)) endArea(world, replaced);
  const length: number = delivery.length > 0 ? (span ?? delivery.length) : 0;
  const reach: number = inheritedFork?.trunkLength ?? (length > 0 ? beamEnd(world, at, toward, length) : 0);
  const lane: GroundLane = { pos: { ...at }, toward: { ...toward }, reach };
  const from: Vec2 = launchPoint(world, offence.sourceId, lane.pos);
  const contact: ForkContact | undefined = inheritedFork === undefined ? forkOnContact(world, offence, from, lane, delivery) : undefined;
  const fork: ForkedLane | undefined = inheritedFork ?? contact?.fork;
  const area: AreaState = { id: world.nextId, ownerId: offence.sourceId, from, skill, offence, pos: lane.pos, toward: lane.toward, reach: fork?.trunkLength ?? reach, ...(fork === undefined ? {} : { fork }), timeLeft: delivery.duration, pulseLeft: delivery.pulse, pulses: 0 };
  world.nextId += 1;
  world.areas.push(area);
  world.events.push({ type: 'area', area, stage: 'start', hits: 0 });
  raiseAura(world, area);
  return { area, hits: delivery.opening ? pulse(world, area, delivery, contact?.target) : 0 };
}

function endArea(world: World, area: AreaState): void {
  world.areas = world.areas.filter((other: AreaState): boolean => other !== area);
  world.events.push({ type: 'area', area, stage: 'end', hits: 0 });
  dropAura(world, area);
}

function laneDistance(lane: GroundLane, pos: ReadonlyVec2): number {
  return (pos.x - lane.pos.x) * lane.toward.x + (pos.z - lane.pos.z) * lane.toward.z;
}

function laneCovers(lane: GroundLane, width: number, pos: ReadonlyVec2, radius: number): boolean {
  const along: number = laneDistance(lane, pos);
  const across: number = Math.abs((pos.x - lane.pos.x) * lane.toward.z - (pos.z - lane.pos.z) * lane.toward.x);
  return along >= -radius && along <= lane.reach + radius && across <= width + radius;
}

function forkOnContact(world: World, offence: Offence, from: Vec2, lane: GroundLane, delivery: AreaDelivery): ForkContact | undefined {
  const spec = delivery.fork;
  if (spec === undefined || spec.length <= 0 || lane.reach <= 0) return undefined;
  const side = { sourceId: offence.sourceId, faction: offence.faction, from };
  let first: Actor | undefined;
  let nearest: number = Infinity;
  for (const actor of targetsWhere(world, side, (target: Actor): boolean => laneCovers(lane, delivery.radius, target.pos, target.radius))) {
    const along: number = laneDistance(lane, actor.pos);
    if (along < nearest && sameFloor(world, lane.pos, actor.pos) && canReceiveHit(world, actor)) {
      first = actor;
      nearest = along;
    }
  }
  if (first === undefined) return undefined;
  const trunkLength: number = Math.max(0, Math.min(lane.reach, nearest));
  const pos: Vec2 = { x: lane.pos.x + lane.toward.x * trunkLength, z: lane.pos.z + lane.toward.z * trunkLength };
  const arms: GroundLane[] = [];
  for (const degrees of [-spec.degrees, spec.degrees]) {
    const toward: Vec2 = rotate(lane.toward, degrees * DEGREES_TO_RADIANS);
    const reach: number = beamEnd(world, pos, toward, spec.length);
    if (reach > 0) arms.push({ pos, toward, reach });
  }
  return { target: first, fork: { trunkLength, arms } };
}

function struckLane(area: AreaState, delivery: AreaDelivery, pos: ReadonlyVec2, radius: number): GroundLane | undefined {
  if (laneCovers(area, delivery.radius, pos, radius)) return area;
  return area.fork?.arms.find((lane: GroundLane): boolean => laneCovers(lane, delivery.radius, pos, radius));
}

export function areaCovers(area: AreaState, delivery: AreaDelivery, pos: ReadonlyVec2, radius: number): boolean {
  if (delivery.length === 0) return Math.hypot(pos.x - area.pos.x, pos.z - area.pos.z) <= delivery.radius + radius;
  return struckLane(area, delivery, pos, radius) !== undefined;
}

function covers(world: World, area: AreaState, delivery: AreaDelivery, pos: ReadonlyVec2, radius: number): boolean {
  if (area.fork === undefined) return areaCovers(area, delivery, pos, radius) && sameFloor(world, area.pos, pos);
  const lane: GroundLane | undefined = struckLane(area, delivery, pos, radius);
  return lane !== undefined && sameFloor(world, lane.pos, pos);
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

export function areaAxisPoint(lane: GroundLane, delivery: AreaDelivery, pos: ReadonlyVec2): Vec2 {
  if (delivery.length === 0) return { x: lane.pos.x, z: lane.pos.z };
  const along: number = Math.min(lane.reach, Math.max(0, laneDistance(lane, pos)));
  return { x: lane.pos.x + lane.toward.x * along, z: lane.pos.z + lane.toward.z * along };
}

function awayFrom(area: GroundLane, delivery: AreaDelivery, pos: ReadonlyVec2): Vec2 {
  const axis: Vec2 = areaAxisPoint(area, delivery, pos);
  const offset: Vec2 = { x: pos.x - axis.x, z: pos.z - axis.z };
  const gap: number = Math.hypot(offset.x, offset.z);
  return gap > 0 ? { x: offset.x / gap, z: offset.z / gap } : { x: area.toward.x, z: area.toward.z };
}

function pulse(world: World, area: AreaState, delivery: AreaDelivery, first?: Actor): number {
  const offence: Offence = stokedOffence(area, delivery);
  let hits: number = 0;
  const targets: Actor[] = targetsWhere(world, { sourceId: area.offence.sourceId, faction: area.offence.faction, from: area.from }, (actor: Actor): boolean => actor !== first && covers(world, area, delivery, actor.pos, actor.radius));
  if (first !== undefined) targets.unshift(first);
  for (const target of targets) {
    if (!covers(world, area, delivery, target.pos, target.radius)) continue;
    const lane: GroundLane = area.fork === undefined ? area : (struckLane(area, delivery, target.pos, target.radius) ?? area);
    const toward: ReadonlyVec2 = delivery.pushForward ? lane.toward : awayFrom(lane, delivery, target.pos);
    if (applyHit(world, offence, target, area.skill, toward)) hits += 1;
  }
  area.pulses += 1;
  world.events.push({ type: 'area', area, stage: 'pulse', hits });
  return hits;
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
