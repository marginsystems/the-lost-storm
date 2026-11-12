import type { FieldDelivery } from '../content/shape-types.ts';
import type { SkillDef } from '../content/types.ts';
import type { ReadonlyVec2, Vec2 } from '../math.ts';
import { moveWithCollision } from '../nav/grid.ts';
import { applyHit, findActor, targetsOf } from './combat.ts';
import type { Actor, FieldState, Offence, Team, World } from './types.ts';

export const FIELDS = {
  pullStop: 0.6,
  settle: 1e-6,
} as const;

export function fieldOf(skill: SkillDef): FieldDelivery | null {
  return skill.delivery.type === 'field' ? skill.delivery : null;
}

export function placeField(world: World, offence: Offence, skill: SkillDef, at: ReadonlyVec2): FieldState | null {
  const delivery: FieldDelivery | null = fieldOf(skill);
  if (delivery === null) return null;
  const field: FieldState = { id: world.nextId, ownerId: offence.sourceId, skill, offence, pos: { x: at.x, z: at.z }, timeLeft: delivery.duration, pulseLeft: delivery.pulse };
  world.nextId += 1;
  world.fields.push(field);
  world.events.push({ type: 'field', field, stage: 'start', hits: 0 });
  return field;
}

function covers(field: FieldState, delivery: FieldDelivery, pos: ReadonlyVec2, radius: number): boolean {
  return Math.hypot(pos.x - field.pos.x, pos.z - field.pos.z) <= delivery.radius + radius;
}

export function timeScaleAt(world: World, team: Team, pos: ReadonlyVec2, radius: number): number {
  let scale: number = 1;
  for (const field of world.fields) {
    const delivery: FieldDelivery | null = fieldOf(field.skill);
    if (delivery === null || field.offence.team === team || !covers(field, delivery, pos, radius)) continue;
    scale = Math.min(scale, delivery.slow);
  }
  return scale;
}

export function timeScaleOf(world: World, actor: Actor): number {
  return timeScaleAt(world, actor.kind, actor.pos, actor.radius);
}

function pull(world: World, field: FieldState, delivery: FieldDelivery, dt: number): void {
  if (delivery.pull <= 0) return;
  for (const target of targetsOf(world, field.offence.team)) {
    if (!covers(field, delivery, target.pos, target.radius)) continue;
    const offset: Vec2 = { x: field.pos.x - target.pos.x, z: field.pos.z - target.pos.z };
    const gap: number = Math.hypot(offset.x, offset.z);
    const step: number = Math.min(delivery.pull * dt, gap - FIELDS.pullStop);
    if (step <= 0) continue;
    moveWithCollision(world.grid, target.pos, (offset.x / gap) * step, (offset.z / gap) * step);
  }
}

function pulse(world: World, field: FieldState, delivery: FieldDelivery): void {
  let hits: number = 0;
  for (const target of targetsOf(world, field.offence.team)) {
    if (!covers(field, delivery, target.pos, target.radius)) continue;
    const offset: Vec2 = { x: target.pos.x - field.pos.x, z: target.pos.z - field.pos.z };
    const gap: number = Math.hypot(offset.x, offset.z);
    const away: Vec2 = gap > 0 ? { x: offset.x / gap, z: offset.z / gap } : { x: 0, z: 1 };
    if (applyHit(world, field.offence, target, field.skill, away)) hits += 1;
  }
  world.events.push({ type: 'field', field, stage: 'pulse', hits });
}

function stepField(world: World, field: FieldState, dt: number): boolean {
  const delivery: FieldDelivery | null = fieldOf(field.skill);
  if (delivery === null) return false;
  if (delivery.anchor === 'caster') {
    const owner: Actor | null = findActor(world, field.ownerId);
    if (owner === null || !owner.alive) {
      world.events.push({ type: 'field', field, stage: 'end', hits: 0 });
      return false;
    }
    field.pos.x = owner.pos.x;
    field.pos.z = owner.pos.z;
  }
  field.timeLeft -= dt;
  pull(world, field, delivery, dt);
  if (delivery.pulse > 0) {
    field.pulseLeft -= dt;
    while (field.pulseLeft <= FIELDS.settle && field.timeLeft - field.pulseLeft > -FIELDS.settle) {
      pulse(world, field, delivery);
      field.pulseLeft += delivery.pulse;
    }
  }
  if (field.timeLeft > FIELDS.settle) return true;
  world.events.push({ type: 'field', field, stage: 'end', hits: 0 });
  return false;
}

export function stepFields(world: World, dt: number): void {
  world.fields = world.fields.filter((field: FieldState): boolean => stepField(world, field, dt));
}

export function clearFields(world: World): void {
  world.fields = [];
}
