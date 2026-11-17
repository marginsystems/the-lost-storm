import type { MonsterElement } from '../content/combat-types.ts';
import type { DamageType, ResistanceRules, StatBlock } from '../content/types.ts';
import { damageTakenScale } from '../stats.ts';
import type { Actor } from './types.ts';

export function elementOf(actor: Actor | null): MonsterElement | null {
  return actor?.kind === 'monster' ? actor.def.element : null;
}

export function heroTaken(stats: StatBlock, type: DamageType, element: MonsterElement | null, rules: ResistanceRules, stormTier: number): number {
  const own: number = damageTakenScale(stats, type, rules, stormTier);
  if (element === null) return own;
  return own * (1 - element.share) + damageTakenScale(stats, element.type, rules, stormTier) * element.share;
}

export function monsterTaken(element: MonsterElement | null, type: DamageType): number {
  return element !== null && element.type === type ? 1 - element.resist : 1;
}
