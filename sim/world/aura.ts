import { auraOf } from '../content/aura-rules.ts';
import type { AreaAura, AreaExposure } from '../content/shape-types.ts';
import type { SkillDef, StatMod } from '../content/types.ts';
import { skillMatches } from '../powers.ts';
import { refreshHero } from './character.ts';
import { sameFloor } from './floors.ts';
import { findHero, sameSide } from './heroes.ts';
import type { Actor, AreaState, BuffState, EmpowerState, PlayerState, World } from './types.ts';

export const AURA = {
  keyPrefix: 'aura:',
  outlast: 1,
} as const;

export interface AuraReading {
  readonly id: number;
  readonly skill: SkillDef;
  readonly timeLeft: number;
  readonly duration: number;
}

function auraKey(area: AreaState): string {
  return `${AURA.keyPrefix}${area.id}`;
}

function ownKey(area: AreaState): (key: string) => boolean {
  const key: string = auraKey(area);
  return (held: string): boolean => held === key || held.startsWith(`${key}:`);
}

export function auraDuration(area: AreaState): number {
  return area.skill.delivery.type === 'area' ? area.skill.delivery.duration : 0;
}

export function raiseAura(world: World, area: AreaState): void {
  const aura: AreaAura | null = auraOf(area.skill);
  const hero: PlayerState | null = findHero(world, area.ownerId);
  if (aura === null || hero === null) return;
  const timeLeft: number = auraDuration(area) + AURA.outlast;
  const key: string = auraKey(area);
  aura.statMods.forEach((mod: StatMod, index: number): void => {
    hero.powers.buffs.push({ key: `${key}:${index}`, mod, stacks: 1, timeLeft });
  });
  if (aura.skillMods.length > 0) hero.powers.empowers.push({ key, skillMods: aura.skillMods, look: null, timeLeft });
  refreshHero(world, hero);
}

export function dropAura(world: World, area: AreaState): void {
  if (auraOf(area.skill) === null) return;
  const hero: PlayerState | null = findHero(world, area.ownerId);
  if (hero === null) return;
  const owned: (key: string) => boolean = ownKey(area);
  const buffs: BuffState[] = hero.powers.buffs.filter((held: BuffState): boolean => !owned(held.key));
  const empowers: EmpowerState[] = hero.powers.empowers.filter((held: EmpowerState): boolean => !owned(held.key));
  if (buffs.length === hero.powers.buffs.length && empowers.length === hero.powers.empowers.length) return;
  hero.powers.buffs = buffs;
  hero.powers.empowers = empowers;
  refreshHero(world, hero);
}

export function replacedAuras(world: World, ownerId: number, skill: SkillDef): readonly AreaState[] {
  if (auraOf(skill) === null) return [];
  return world.areas.filter((area: AreaState): boolean => area.ownerId === ownerId && auraOf(area.skill) !== null && area.skill.form === skill.form);
}

function surrounds(world: World, area: AreaState, actor: Actor): boolean {
  const delivery = area.skill.delivery;
  if (delivery.type !== 'area') return false;
  return Math.hypot(actor.pos.x - area.pos.x, actor.pos.z - area.pos.z) <= delivery.radius + actor.radius && sameFloor(world, area.pos, actor.pos);
}

export function exposedScale(world: World, striker: Actor | null, target: Actor, skill: SkillDef): number {
  if (striker === null) return 1;
  let bonus: number = 0;
  for (const area of world.areas) {
    const aura: AreaAura | null = auraOf(area.skill);
    if (aura === null || aura.exposes.length === 0) continue;
    if (!sameSide(world, area.offence, striker) || sameSide(world, area.offence, target) || !surrounds(world, area, target)) continue;
    for (const exposure of aura.exposes.filter((entry: AreaExposure): boolean => skillMatches(world.content, entry.target, skill))) bonus = Math.max(bonus, exposure.value);
  }
  return 1 + bonus;
}

export function heroAuras(world: World, hero: PlayerState): readonly AuraReading[] {
  return world.areas
    .filter((area: AreaState): boolean => area.ownerId === hero.id && auraOf(area.skill) !== null)
    .map((area: AreaState): AuraReading => ({ id: area.id, skill: area.skill, timeLeft: Math.max(0, area.timeLeft), duration: auraDuration(area) }));
}
