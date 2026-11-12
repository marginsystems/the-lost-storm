import policyFile from './simulate-policies.json' with { type: 'json' };
import type { BotHabits } from '../sim/bot.ts';
import type { BotPlan } from '../sim/bot-plan.ts';
import type { Fields } from '../sim/content/read.ts';
import { ContentError, each, fields, flag, nullableText, numeric, text, textList } from '../sim/content/read.ts';
import type { MilestoneRule } from '../sim/measure.ts';
import { ALPHA_RULES } from '../src/launch/data.ts';
import type { Milestone } from '../src/launch/alpha.ts';

export interface SkillPolicy {
  readonly name: string;
  readonly habits: BotHabits;
  readonly flaskAt: number | null;
  readonly manaFlaskAt: number | null;
  readonly rolls: boolean;
  readonly loot: boolean;
  readonly lineSeconds: number;
  readonly readSeconds: number;
}

export interface BuildPolicy {
  readonly name: string;
  readonly paths: readonly string[];
  readonly skills: readonly string[];
}

export interface Policies {
  readonly skills: ReadonlyMap<string, SkillPolicy>;
  readonly builds: ReadonlyMap<string, BuildPolicy>;
  readonly milestones: readonly MilestoneRule[];
  readonly endCard: string;
  readonly rare: string;
  readonly windows: readonly number[];
  readonly sampleMinutes: number;
}

function positive(value: number, where: string): number {
  if (value <= 0) throw new ContentError(where, 'expected a number above zero');
  return value;
}

function nullableNumber(source: Fields, key: string, where: string): number | null {
  return source[key] === null ? null : numeric(source, key, where);
}

function readSkill(name: string, value: unknown): SkillPolicy {
  const where: string = `skills.${name}`;
  const source: Fields = fields(value, where);
  return {
    name,
    habits: { dodges: flag(source, 'dodges', where), reaction: numeric(source, 'reaction', where) },
    flaskAt: nullableNumber(source, 'flaskAt', where),
    manaFlaskAt: nullableNumber(source, 'manaFlaskAt', where),
    rolls: flag(source, 'rolls', where),
    loot: flag(source, 'loot', where),
    lineSeconds: numeric(source, 'lineSeconds', where),
    readSeconds: numeric(source, 'readSeconds', where),
  };
}

function readBuild(name: string, value: unknown): BuildPolicy {
  const where: string = `builds.${name}`;
  const source: Fields = fields(value, where);
  return { name, paths: textList(source, 'paths', where), skills: textList(source, 'skills', where) };
}

function alphaMilestone(milestone: Milestone): MilestoneRule {
  switch (milestone.kind) {
    case 'flag':
      return { kind: 'flag', name: milestone.event, flag: milestone.flag, is: milestone.is };
    case 'zone':
      return { kind: 'zone', name: milestone.event, zone: milestone.zone };
  }
  return { kind: 'zone', name: 'unknown', zone: 'unknown' };
}

function endCardRule(name: string): MilestoneRule[] {
  const complete = ALPHA_RULES.complete;
  switch (complete.kind) {
    case 'flag':
      return [{ kind: 'flag', name, flag: complete.flag, is: null }];
    case 'act':
      return [];
  }
  return [];
}

function readExtra(value: unknown, where: string): MilestoneRule {
  const source: Fields = fields(value, where);
  return { kind: 'flag', name: text(source, 'name', where), flag: text(source, 'flag', where), is: nullableText(source, 'is', where) };
}

export function readPolicies(value: unknown): Policies {
  const source: Fields = fields(value, 'policies');
  const skills: Fields = fields(source['skills'], 'policies.skills');
  const builds: Fields = fields(source['builds'], 'policies.builds');
  const endCard: string = text(source, 'endCard', 'policies');
  const rare: string = text(source, 'rare', 'policies');
  const extra: MilestoneRule[] = each(source['milestones'], 'policies.milestones', readExtra);
  return {
    skills: new Map<string, SkillPolicy>(Object.entries(skills).map(([name, entry]: [string, unknown]): [string, SkillPolicy] => [name, readSkill(name, entry)])),
    builds: new Map<string, BuildPolicy>(Object.entries(builds).map(([name, entry]: [string, unknown]): [string, BuildPolicy] => [name, readBuild(name, entry)])),
    milestones: [...ALPHA_RULES.milestones.map(alphaMilestone), ...extra, ...endCardRule(endCard)],
    endCard,
    rare,
    windows: each(source['windows'], 'policies.windows', (entry: unknown, where: string): number => positive(numeric({ value: entry }, 'value', where), where)),
    sampleMinutes: positive(numeric(source, 'sampleMinutes', 'policies'), 'policies.sampleMinutes'),
  };
}

export const POLICIES: Policies = readPolicies(policyFile);

export function planFor(skill: SkillPolicy, build: BuildPolicy): BotPlan {
  return {
    name: `${skill.name}/${build.name}`,
    flaskAt: skill.flaskAt,
    manaFlaskAt: skill.manaFlaskAt,
    rolls: skill.rolls,
    loot: skill.loot,
    lineSeconds: skill.lineSeconds,
    readSeconds: skill.readSeconds,
    paths: build.paths,
    skills: build.skills,
  };
}
