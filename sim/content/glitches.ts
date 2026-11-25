import glitches from '../../data/glitches.json' with { type: 'json' };
import { condition } from './parse-conditions.ts';
import type { Fields } from './read.ts';
import { ContentError, choice, choiceList, each, fields, fraction, numeric, positive, text, textList } from './read.ts';
import type { Condition, Content } from './types.ts';

export const GLITCH_KINDS = ['stutter', 'wrong_word'] as const;
export type GlitchKind = (typeof GLITCH_KINDS)[number];

export interface GlitchRules {
  readonly cooldown: number;
  readonly minLifeFraction: number;
  readonly grace: number;
  readonly combatRadius: number;
  readonly combatTick: number;
}

export interface GlitchStage {
  readonly from: number;
  readonly kinds: readonly GlitchKind[];
  readonly combatChancePerMinute: number;
}

export interface GlitchProgress {
  readonly value: number;
  readonly when: readonly Condition[];
}

export const TRIGGER_MOMENTS = ['combat', 'calm', 'any'] as const;
export type TriggerMoment = (typeof TRIGGER_MOMENTS)[number];

export interface GlitchTrigger {
  readonly id: string;
  readonly kind: GlitchKind;
  readonly during: TriggerMoment;
  readonly when: readonly Condition[];
}

export interface WrongWordDef {
  readonly names: readonly string[];
  readonly template: string;
  readonly window: number;
}

export interface GlitchDef {
  readonly seed: number;
  readonly rules: GlitchRules;
  readonly stages: readonly GlitchStage[];
  readonly progress: readonly GlitchProgress[];
  readonly triggers: readonly GlitchTrigger[];
  readonly stutter: number;
  readonly wrongWord: WrongWordDef;
}

export interface GlitchKnown {
  readonly quests: ReadonlySet<string>;
}

function nonNegative(source: Fields, key: string, where: string): number {
  const value: number = numeric(source, key, where);
  if (value < 0) throw new ContentError(`${where}.${key}`, 'expected zero or more');
  return value;
}

function rules(value: unknown, where: string): GlitchRules {
  const source: Fields = fields(value, where);
  return {
    cooldown: positive(source, 'cooldown', where),
    minLifeFraction: fraction(source, 'minLifeFraction', where),
    grace: nonNegative(source, 'grace', where),
    combatRadius: positive(source, 'combatRadius', where),
    combatTick: positive(source, 'combatTick', where),
  };
}

function stage(value: unknown, where: string): GlitchStage {
  const source: Fields = fields(value, where);
  return {
    from: nonNegative(source, 'from', where),
    kinds: choiceList(source, 'kinds', GLITCH_KINDS, where),
    combatChancePerMinute: nonNegative(source, 'combatChancePerMinute', where),
  };
}

function conditions(source: Fields, where: string): Condition[] {
  return each(source['when'], `${where}.when`, condition);
}

function progress(value: unknown, where: string): GlitchProgress {
  const source: Fields = fields(value, where);
  return { value: positive(source, 'value', where), when: conditions(source, where) };
}

function trigger(value: unknown, where: string): GlitchTrigger {
  const source: Fields = fields(value, where);
  return { id: text(source, 'id', where), kind: choice(source, 'kind', GLITCH_KINDS, where), during: choice(source, 'during', TRIGGER_MOMENTS, where), when: conditions(source, where) };
}

function conditionQuests(list: readonly Condition[]): string[] {
  return list.flatMap((entry: Condition): string[] => (entry.type === 'flag' || entry.type === 'shore' || entry.type === 'hero' || entry.type === 'level' || entry.type === 'visited' || entry.type === 'defeated' || entry.type === 'restraint' ? [] : [entry.quest]));
}

function check(def: GlitchDef): void {
  def.stages.forEach((entry: GlitchStage, index: number): void => {
    if (entry.kinds.length === 0) throw new ContentError(`glitches.stages[${index}].kinds`, 'expected at least one kind');
    const previous: GlitchStage | undefined = def.stages[index - 1];
    if (previous !== undefined && previous.from >= entry.from) throw new ContentError(`glitches.stages[${index}]`, 'stages must rise in from');
  });
  if (def.stages[0]?.from !== 0) throw new ContentError('glitches.stages', 'the first stage must start from 0');
  const ids: Set<string> = new Set<string>();
  for (const entry of def.triggers) {
    if (ids.has(entry.id)) throw new ContentError('glitches.triggers', `duplicate id ${entry.id}`);
    ids.add(entry.id);
  }
  if (def.wrongWord.names.length === 0) throw new ContentError('glitches.wrongWord.names', 'expected at least one name');
  if (!def.wrongWord.template.includes('{name}') || !def.wrongWord.template.includes('{line}')) throw new ContentError('glitches.wrongWord.template', 'expected {name} and {line}');
}

export function glitchProblems(def: GlitchDef, known: GlitchKnown): string[] {
  const problems: string[] = [];
  const quests: string[] = [...def.progress.flatMap((entry: GlitchProgress): string[] => conditionQuests(entry.when)), ...def.triggers.flatMap((entry: GlitchTrigger): string[] => conditionQuests(entry.when))];
  for (const quest of quests) if (!known.quests.has(quest)) problems.push(`glitches: unknown quest ${quest}`);
  return problems;
}

export function parseGlitches(value: unknown): GlitchDef {
  const where: string = 'glitches';
  const source: Fields = fields(value, where);
  const word: Fields = fields(source['wrongWord'], `${where}.wrongWord`);
  const def: GlitchDef = {
    seed: Math.floor(nonNegative(source, 'seed', where)),
    rules: rules(source['rules'], `${where}.rules`),
    stages: each(source['stages'], `${where}.stages`, stage),
    progress: each(source['progress'], `${where}.progress`, progress),
    triggers: each(source['triggers'], `${where}.triggers`, trigger),
    stutter: positive(source, 'stutter', where),
    wrongWord: { names: textList(word, 'names', `${where}.wrongWord`), template: text(word, 'template', `${where}.wrongWord`), window: positive(word, 'window', `${where}.wrongWord`) },
  };
  check(def);
  return def;
}

export function glitchKnownOf(content: Content): GlitchKnown {
  return { quests: new Set<string>(content.quests.keys()) };
}

export function loadGlitches(): GlitchDef {
  return parseGlitches(glitches);
}
