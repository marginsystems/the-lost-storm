import type { SkillTrail } from '../content/combat-types.ts';
import type { SkillDef } from '../content/types.ts';
import type { ReadonlyVec2, Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { leftBehind } from '../powers.ts';
import { placeArea } from './areas.ts';
import { findActor, offenceOf } from './combat.ts';
import { settleTurn } from './momentum.ts';
import { beamEnd } from './shapes.ts';
import type { ActionState, Actor, AreaState, ChannelState, World } from './types.ts';

export function beginChannel(world: World, actor: Actor, action: ActionState, aim: ReadonlyVec2): void {
  if (action.skill.press?.type === 'channel') world.channels.push({ actorId: actor.id, action, aim: { x: aim.x, z: aim.z }, last: null, piecesDrawn: 0 });
}

export function aimChannel(world: World, actor: Actor, aim: ReadonlyVec2): void {
  for (const channel of world.channels) {
    if (channel.actorId !== actor.id || channel.action !== actor.action) continue;
    channel.aim = { x: aim.x, z: aim.z };
  }
}

function channelling(world: World, channel: ChannelState): boolean {
  const actor: Actor | null = findActor(world, channel.actorId);
  return actor !== null && actor.alive && actor.action === channel.action && channel.action.phase !== 'recovery';
}

export function endChannels(world: World): void {
  if (world.channels.length === 0) return;
  world.channels = world.channels.filter((channel: ChannelState): boolean => {
    if (channelling(world, channel)) return true;
    world.events.push({ type: 'channel_end', actorId: channel.actorId, skill: channel.action.skill });
    return false;
  });
}

function ownTrail(world: World, actor: Actor, skill: string): AreaState[] {
  return world.areas.filter((area: AreaState): boolean => area.ownerId === actor.id && area.skill.id === skill && area.timeLeft > 0);
}

export function drawCapacity(world: World, actor: Actor, trail: SkillTrail | null): number {
  return trail?.stopAtLimit === true ? trail.limit - ownTrail(world, actor, trail.skill).length : Infinity;
}

function layTrail(world: World, actor: Actor, parent: SkillDef, trail: SkillTrail): void {
  const left: SkillDef | undefined = world.content.skills.get(trail.skill);
  if (left === undefined) return;
  const laid: AreaState[] = ownTrail(world, actor, trail.skill);
  if (laid.length >= trail.limit || laid.some((area: AreaState): boolean => distance(area.pos, actor.pos) < trail.every)) return;
  placeArea(world, offenceOf(actor), leftBehind(world, actor.id, parent, left), actor.pos);
}

export function drawnPoint(world: World, actor: Actor, aim: ReadonlyVec2, range: number): Vec2 {
  const offset: Vec2 = { x: aim.x - actor.pos.x, z: aim.z - actor.pos.z };
  const gap: number = Math.hypot(offset.x, offset.z);
  if (gap === 0) return { x: actor.pos.x, z: actor.pos.z };
  const toward: Vec2 = { x: offset.x / gap, z: offset.z / gap };
  const reach: number = beamEnd(world, actor.pos, toward, Math.min(gap, range));
  return { x: actor.pos.x + toward.x * reach, z: actor.pos.z + toward.z * reach };
}

function burnOutOldest(world: World, actor: Actor, trail: SkillTrail): void {
  const laid: AreaState[] = ownTrail(world, actor, trail.skill);
  const spare: number = laid.length - trail.limit + 1;
  for (const area of laid.slice(0, Math.max(0, spare))) area.timeLeft = 0;
}

function drawTrail(world: World, actor: Actor, channel: ChannelState, trail: SkillTrail): void {
  const left: SkillDef | undefined = world.content.skills.get(trail.skill);
  if (left === undefined) return;
  const point: Vec2 = drawnPoint(world, actor, channel.aim, trail.range);
  let last: Vec2 | null = channel.last;
  if (last === null) {
    channel.last = point;
    return;
  }
  let gap: number = distance(last, point);
  if (gap < trail.every) return;
  let remaining: number = trail.stopAtLimit ? Math.min(trail.limit - channel.piecesDrawn, drawCapacity(world, actor, trail)) : Infinity;
  while (gap >= trail.every && remaining > 0) {
    const toward: Vec2 = { x: (point.x - last.x) / gap, z: (point.z - last.z) / gap };
    if (!trail.stopAtLimit) burnOutOldest(world, actor, trail);
    placeArea(world, offenceOf(actor), leftBehind(world, actor.id, channel.action.skill, left), last, toward, trail.every);
    last = { x: last.x + toward.x * trail.every, z: last.z + toward.z * trail.every };
    channel.piecesDrawn += 1;
    remaining -= 1;
    gap -= trail.every;
  }
  channel.last = last;
  if (remaining === 0) dropChannel(actor);
}

export function stepChannelTrails(world: World): void {
  for (const channel of world.channels) {
    const trail: SkillTrail | null = channel.action.skill.trail;
    if (trail === null || !channelling(world, channel)) continue;
    const actor: Actor | null = findActor(world, channel.actorId);
    if (actor === null) continue;
    switch (trail.from) {
      case 'feet':
        layTrail(world, actor, channel.action.skill, trail);
        break;
      case 'aim':
        drawTrail(world, actor, channel, trail);
        break;
    }
  }
}

export function dropChannel(actor: Actor): void {
  const action: ActionState | null = actor.action;
  if (action === null || action.skill.press?.type !== 'channel') return;
  settleTurn(actor, action);
  actor.action = null;
}
