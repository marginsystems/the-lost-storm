import type { ComboStep, Content, SkillBinding, SkillDef, StatBlock } from './content/types.ts';
import { wornPowers, wornVariants } from './powers.ts';
import type { SaveData } from './save.ts';
import { computeStats, expectedHit, resolveSkill, skillCycle } from './stats.ts';
import { stepSkill } from './world/skills.ts';

export const LADDER = {
  ceiling: 1_000_000_000,
  mainBinding: 'mouse_left',
} as const;

export const DAMAGE_EXPLAINED: string = 'Damage per second of your main attack against an unarmoured target';

export const DAMAGE_NAME: string = 'Damage per second';

export type LadderSubject = Pick<SaveData, 'level' | 'equipped' | 'allocated' | 'bar'>;

export interface LadderFigures {
  readonly damage: number;
  readonly life: number;
}

export function bounded(value: number): number {
  if (Number.isNaN(value) || value <= 0) return 0;
  return Math.floor(Math.min(LADDER.ceiling, value));
}

export function mainSlot(content: Content): number {
  const slot: number = content.player.skillBar.findIndex((binding: SkillBinding): boolean => binding.bindings.includes(LADDER.mainBinding));
  return slot < 0 ? 0 : slot;
}

export function mainAttack(content: Content, subject: LadderSubject): SkillDef | null {
  const slot: number = mainSlot(content);
  const id: string | null = subject.bar[slot] ?? content.player.skillBar[slot]?.skill ?? null;
  const base: SkillDef | undefined = id === null ? undefined : content.skills.get(id);
  if (base === undefined) return null;
  return resolveSkill(content, base, subject.allocated, wornPowers(content, subject.equipped), wornVariants(content, subject.equipped));
}

export function chainOf(skill: SkillDef): readonly SkillDef[] {
  return [skill, ...(skill.combo?.steps ?? []).map((step: ComboStep): SkillDef => stepSkill(skill, step))];
}

export function sustainedDamage(stats: StatBlock, skill: SkillDef): number {
  const chain: readonly SkillDef[] = chainOf(skill);
  const hits: number = chain.reduce((sum: number, step: SkillDef): number => sum + expectedHit(stats, step), 0);
  const cycle: number = chain.reduce((sum: number, step: SkillDef): number => sum + skillCycle(stats, step), 0);
  return hits / cycle;
}

export function ladderFigures(content: Content, subject: LadderSubject): LadderFigures {
  const stats: StatBlock = computeStats(content, subject.level, subject.equipped, subject.allocated);
  const skill: SkillDef | null = mainAttack(content, subject);
  return {
    damage: skill === null ? 0 : bounded(sustainedDamage(stats, skill)),
    life: bounded(stats.maxLife),
  };
}
