import { PLAYER_SIDE } from '../content/combat-types.ts';
import type { SkillMend } from '../content/mend-types.ts';
import type { SkillDef } from '../content/types.ts';
import type { ReadonlyVec2 } from '../math.ts';
import type { Side } from './factions.ts';
import { regardOf, sideOf } from './factions.ts';
import { sameFloor } from './floors.ts';
import { restoreLife } from './mend.ts';
import { findHero } from './heroes.ts';
import type { Actor, PlayerState, World } from './types.ts';

export interface MendPulse {
  readonly skill: SkillDef;
  readonly mend: SkillMend;
  readonly origin: ReadonlyVec2;
  readonly radius: number;
}

export function isAlly(world: World, side: Side, target: Actor): boolean {
  if (!target.alive || (target.kind === 'monster' && target.sealed)) return false;
  const healer: PlayerState | null = side.faction === null && target.kind === 'player' ? findHero(world, side.sourceId) : null;
  if (healer !== null && target.kind === 'player') return healer.party === target.party;
  const from: string = side.faction ?? PLAYER_SIDE;
  const toward: string = sideOf(target);
  return from === toward || regardOf(world.content, toward, from) === 'friendly' || regardOf(world.content, from, toward) === 'friendly';
}

export function alliesOf(world: World, side: Side): Actor[] {
  return [...world.heroes, ...world.monsters].filter((actor: Actor): boolean => isAlly(world, side, actor));
}

export function mendAmount(mend: SkillMend, target: Actor): number {
  return Math.round(mend.flat + mend.lifeShare * target.maxLife);
}

export function healActor(world: World, sourceId: number, target: Actor, amount: number, skill: SkillDef): number {
  if (!target.alive || amount <= 0) return 0;
  const gained: number = restoreLife(target, amount);
  if (gained > 0) world.events.push({ type: 'heal', sourceId, targetId: target.id, amount: gained, wanted: amount, skill, pos: { x: target.pos.x, z: target.pos.z } });
  return gained;
}

function within(world: World, pulse: MendPulse, target: Actor): boolean {
  return Math.hypot(target.pos.x - pulse.origin.x, target.pos.z - pulse.origin.z) <= pulse.radius + target.radius && sameFloor(world, pulse.origin, target.pos);
}

export function hasWoundedAlly(world: World, side: Side, pulse: MendPulse): boolean {
  const needsMend = (target: Actor): boolean => {
    if (target.id === side.sourceId || target.life >= target.maxLife || !within(world, pulse, target) || !isAlly(world, side, target)) return false;
    const amount: number = mendAmount(pulse.mend, target);
    return amount > 0 && target.maxLife - target.life >= amount;
  };
  return world.monsters.some(needsMend) || world.heroes.some(needsMend);
}

export function mendAllies(world: World, side: Side, pulse: MendPulse): number {
  let healed: number = 0;
  for (const target of alliesOf(world, side)) {
    if (!within(world, pulse, target)) continue;
    if (healActor(world, side.sourceId, target, mendAmount(pulse.mend, target), pulse.skill) > 0) healed += 1;
  }
  return healed;
}
