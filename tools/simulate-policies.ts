import policyFile from './simulate-policies.json' with { type: 'json' };
import type { BotHabits } from '../sim/bot.ts';
import type { BotPlan, GearWeights, PlayStyle, WeaponKind } from '../sim/bot-plan.ts';
import { STAND_WEIGHTS } from '../sim/bot-plan.ts';
import type { Fields } from '../sim/content/read.ts';
import { ContentError, choice, each, fields, flag, nullableText, numeric, text, textList } from '../sim/content/read.ts';
import type { MilestoneRule } from '../sim/measure.ts';
import type { ReferenceMoments } from './simulate-builds.ts';
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
  readonly route: readonly string[];
  readonly weights: GearWeights;
  readonly focus: string | null;
  readonly style: PlayStyle;
  readonly keepGap: number;
  readonly weapons: WeaponKind;
  readonly hero: string | null;
}

export interface Policies {
  readonly reference: ReferenceMoments;
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

const STYLES: readonly PlayStyle[] = ['stand', 'range', 'kite'];
const WEAPONS: readonly WeaponKind[] = ['any', 'plain', 'varied'];

function readWeights(value: unknown, where: string): GearWeights {
  if (value === undefined) return STAND_WEIGHTS;
  const source: Fields = fields(value, where);
  return { dps: numeric(source, 'dps', where), toughness: numeric(source, 'toughness', where), mobility: numeric(source, 'mobility', where) };
}

function readBuild(name: string, value: unknown): BuildPolicy {
  const where: string = `builds.${name}`;
  const source: Fields = fields(value, where);
  const style: PlayStyle = source['style'] === undefined ? 'stand' : choice(source, 'style', STYLES, where);
  const keepGap: number = source['keepGap'] === undefined ? 0 : numeric(source, 'keepGap', where);
  if (style !== 'stand' && keepGap <= 0) throw new ContentError(where, 'a build that keeps range needs a keepGap above zero');
  return {
    name,
    paths: textList(source, 'paths', where),
    skills: textList(source, 'skills', where),
    route: source['route'] === undefined ? [] : textList(source, 'route', where),
    weights: readWeights(source['weights'], `${where}.weights`),
    focus: source['focus'] === undefined ? null : text(source, 'focus', where),
    style,
    keepGap,
    weapons: source['weapons'] === undefined ? 'any' : choice(source, 'weapons', WEAPONS, where),
    hero: source['hero'] === undefined ? null : text(source, 'hero', where),
  };
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
  const reference: Fields = fields(source['reference'], 'policies.reference');
  return {
    reference: { elite: textList(reference, 'elite', 'policies.reference'), pack: textList(reference, 'pack', 'policies.reference') },
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
    route: build.route,
    weights: build.weights,
    focus: build.focus,
    style: build.style,
    keepGap: build.keepGap,
    weapons: build.weapons,
  };
}
