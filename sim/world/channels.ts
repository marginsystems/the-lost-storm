import type { SkillTrail } from '../content/combat-types.ts';
import type { SkillDef } from '../content/types.ts';
import { distance } from '../math.ts';
import { leftBehind } from '../powers.ts';
import { placeArea } from './areas.ts';
import { findActor, offenceOf } from './combat.ts';
import { settleTurn } from './momentum.ts';
import type { ActionState, Actor, AreaState, ChannelState, World } from './types.ts';

export function beginChannel(world: World, actor: Actor, action: ActionState): void {
  if (action.skill.press?.type === 'channel') world.channels.push({ actorId: actor.id, action });
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

function layTrail(world: World, actor: Actor, parent: SkillDef, trail: SkillTrail): void {
  const left: SkillDef | undefined = world.content.skills.get(trail.skill);
  if (left === undefined) return;
  const laid: AreaState[] = ownTrail(world, actor, trail.skill);
  if (laid.length >= trail.limit || laid.some((area: AreaState): boolean => distance(area.pos, actor.pos) < trail.every)) return;
  placeArea(world, offenceOf(actor), leftBehind(world, actor.id, parent, left), actor.pos);
}

export function stepChannelTrails(world: World): void {
  for (const channel of world.channels) {
    const trail: SkillTrail | null = channel.action.skill.trail;
    if (trail === null || !channelling(world, channel)) continue;
    const actor: Actor | null = findActor(world, channel.actorId);
    if (actor !== null) layTrail(world, actor, channel.action.skill, trail);
  }
}

export function dropChannel(actor: Actor): void {
  const action: ActionState | null = actor.action;
  if (action === null || action.skill.press?.type !== 'channel') return;
  settleTurn(actor, action);
  actor.action = null;
}
