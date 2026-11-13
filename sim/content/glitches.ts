import glitches from '../../data/glitches.json' with { type: 'json' };
import { condition } from './parse-conditions.ts';
import type { Fields } from './read.ts';
import { ContentError, choice, choiceList, each, fields, flag, fraction, numeric, positive, text, textList } from './read.ts';
import type { Condition, Content } from './types.ts';

export const GLITCH_KINDS = ['hard_cut', 'stutter', 'wrong_word', 'quiet_pass'] as const;
export type GlitchKind = (typeof GLITCH_KINDS)[number];

export const EDIT_TYPES = ['monster_dead', 'corpse_gone', 'hero_turn', 'prop_shift', 'prop_swap'] as const;
export type EditType = (typeof EDIT_TYPES)[number];

export interface GlitchSpan {
  readonly min: number;
  readonly max: number;
}

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
  readonly edits: readonly string[];
  readonly combatChancePerMinute: number;
  readonly zoneChance: number;
  readonly mist: GlitchSpan;
  readonly quietPass: boolean;
  readonly silhouettes: number;
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

export interface PropPair {
  readonly from: string;
  readonly to: string;
}

interface EditBase {
  readonly id: string;
  readonly weight: number;
}

export interface MonsterDeadEdit extends EditBase {
  readonly type: 'monster_dead';
  readonly reach: number;
}

export interface CorpseGoneEdit extends EditBase {
  readonly type: 'corpse_gone';
  readonly reach: number;
}

export interface HeroTurnEdit extends EditBase {
  readonly type: 'hero_turn';
}

export interface PropShiftEdit extends EditBase {
  readonly type: 'prop_shift';
  readonly reach: number;
  readonly distance: number;
  readonly props: readonly string[];
}

export interface PropSwapEdit extends EditBase {
  readonly type: 'prop_swap';
  readonly reach: number;
  readonly twoWay: boolean;
  readonly pairs: readonly PropPair[];
}

export type GlitchEdit = MonsterDeadEdit | CorpseGoneEdit | HeroTurnEdit | PropShiftEdit | PropSwapEdit;

export interface WrongWordDef {
  readonly names: readonly string[];
  readonly template: string;
  readonly window: number;
}

export interface SilhouetteDef {
  readonly near: number;
  readonly far: number;
}

export interface GlitchDef {
  readonly seed: number;
  readonly mistZone: string;
  readonly rules: GlitchRules;
  readonly stages: readonly GlitchStage[];
  readonly progress: readonly GlitchProgress[];
  readonly triggers: readonly GlitchTrigger[];
  readonly edits: ReadonlyMap<string, GlitchEdit>;
  readonly stutter: number;
  readonly quietPass: number;
  readonly wrongWord: WrongWordDef;
  readonly silhouettes: SilhouetteDef;
}

export interface GlitchKnown {
  readonly props: ReadonlySet<string>;
  readonly quests: ReadonlySet<string>;
  readonly voidZones: ReadonlySet<string>;
}

function nonNegative(source: Fields, key: string, where: string): number {
  const value: number = numeric(source, key, where);
  if (value < 0) throw new ContentError(`${where}.${key}`, 'expected zero or more');
  return value;
}

function span(value: unknown, where: string): GlitchSpan {
  const source: Fields = fields(value, where);
  const min: number = positive(source, 'min', where);
  const max: number = positive(source, 'max', where);
  if (max < min) throw new ContentError(where, 'max is below min');
  return { min, max };
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
    edits: textList(source, 'edits', where),
    combatChancePerMinute: nonNegative(source, 'combatChancePerMinute', where),
    zoneChance: nonNegative(source, 'zoneChance', where),
    mist: span(source['mist'], `${where}.mist`),
    quietPass: flag(source, 'quietPass', where),
    silhouettes: Math.floor(nonNegative(source, 'silhouettes', where)),
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

function pair(value: unknown, where: string): PropPair {
  const source: Fields = fields(value, where);
  return { from: text(source, 'from', where), to: text(source, 'to', where) };
}

function edit(value: unknown, where: string): GlitchEdit {
  const source: Fields = fields(value, where);
  const id: string = text(source, 'id', where);
  const weight: number = positive(source, 'weight', where);
  const type: EditType = choice(source, 'type', EDIT_TYPES, where);
  let read: GlitchEdit;
  switch (type) {
    case 'monster_dead':
      read = { type, id, weight, reach: positive(source, 'reach', where) };
      break;
    case 'corpse_gone':
      read = { type, id, weight, reach: positive(source, 'reach', where) };
      break;
    case 'hero_turn':
      read = { type, id, weight };
      break;
    case 'prop_shift':
      read = { type, id, weight, reach: positive(source, 'reach', where), distance: positive(source, 'distance', where), props: textList(source, 'props', where) };
      break;
    case 'prop_swap':
      read = { type, id, weight, reach: positive(source, 'reach', where), twoWay: flag(source, 'twoWay', where), pairs: each(source['pairs'], `${where}.pairs`, pair) };
      if (read.pairs.length === 0) throw new ContentError(`${where}.pairs`, 'expected at least one pair');
      break;
  }
  return read;
}

function editProps(entry: GlitchEdit): readonly string[] {
  let props: readonly string[] = [];
  switch (entry.type) {
    case 'prop_shift':
      props = entry.props;
      break;
    case 'prop_swap':
      props = entry.pairs.flatMap((swap: PropPair): string[] => [swap.from, swap.to]);
      break;
    case 'monster_dead':
    case 'corpse_gone':
    case 'hero_turn':
      break;
  }
  return props;
}

function conditionQuests(list: readonly Condition[]): string[] {
  return list.flatMap((entry: Condition): string[] => (entry.type === 'flag' || entry.type === 'shore' || entry.type === 'hero' ? [] : [entry.quest]));
}

function check(def: GlitchDef): void {
  def.stages.forEach((entry: GlitchStage, index: number): void => {
    if (entry.kinds.length === 0) throw new ContentError(`glitches.stages[${index}].kinds`, 'expected at least one kind');
    if (entry.kinds.includes('hard_cut') && entry.edits.length === 0) throw new ContentError(`glitches.stages[${index}].edits`, 'a stage with hard cuts needs at least one edit');
    if (entry.kinds.includes('hard_cut') && ![...def.edits.values()].some((candidate: GlitchEdit): boolean => candidate.type === 'hero_turn')) throw new ContentError(`glitches.stages[${index}].edits`, 'a stage with hard cuts needs a hero_turn edit to fall back on');
    for (const id of entry.edits) if (!def.edits.has(id)) throw new ContentError(`glitches.stages[${index}]`, `unknown edit ${id}`);
    const previous: GlitchStage | undefined = def.stages[index - 1];
    if (previous !== undefined && previous.from >= entry.from) throw new ContentError(`glitches.stages[${index}]`, 'stages must rise in from');
  });
  if (def.stages[0]?.from !== 0) throw new ContentError('glitches.stages', 'the first stage must start from 0');
  const ids: Set<string> = new Set<string>();
  for (const entry of def.triggers) {
    if (ids.has(entry.id)) throw new ContentError('glitches.triggers', `duplicate id ${entry.id}`);
    ids.add(entry.id);
  }
  if (def.silhouettes.far <= def.silhouettes.near) throw new ContentError('glitches.silhouettes', 'far must be beyond near');
  if (def.wrongWord.names.length === 0) throw new ContentError('glitches.wrongWord.names', 'expected at least one name');
  if (!def.wrongWord.template.includes('{name}') || !def.wrongWord.template.includes('{line}')) throw new ContentError('glitches.wrongWord.template', 'expected {name} and {line}');
}

export function glitchProblems(def: GlitchDef, known: GlitchKnown): string[] {
  const problems: string[] = [];
  for (const entry of def.edits.values()) {
    for (const prop of editProps(entry)) if (!known.props.has(prop)) problems.push(`glitches.edits.${entry.id}: unknown prop ${prop}`);
  }
  const quests: string[] = [...def.progress.flatMap((entry: GlitchProgress): string[] => conditionQuests(entry.when)), ...def.triggers.flatMap((entry: GlitchTrigger): string[] => conditionQuests(entry.when))];
  for (const quest of quests) if (!known.quests.has(quest)) problems.push(`glitches: unknown quest ${quest}`);
  if (!known.voidZones.has(def.mistZone)) problems.push(`glitches.mistZone: ${def.mistZone} is not a void zone`);
  return problems;
}

export function parseGlitches(value: unknown): GlitchDef {
  const where: string = 'glitches';
  const source: Fields = fields(value, where);
  const editList: GlitchEdit[] = each(source['edits'], `${where}.edits`, edit);
  const edits: Map<string, GlitchEdit> = new Map<string, GlitchEdit>();
  for (const entry of editList) {
    if (edits.has(entry.id)) throw new ContentError(`${where}.edits`, `duplicate id ${entry.id}`);
    edits.set(entry.id, entry);
  }
  const word: Fields = fields(source['wrongWord'], `${where}.wrongWord`);
  const shadows: Fields = fields(source['silhouettes'], `${where}.silhouettes`);
  const def: GlitchDef = {
    seed: Math.floor(nonNegative(source, 'seed', where)),
    mistZone: text(source, 'mistZone', where),
    rules: rules(source['rules'], `${where}.rules`),
    stages: each(source['stages'], `${where}.stages`, stage),
    progress: each(source['progress'], `${where}.progress`, progress),
    triggers: each(source['triggers'], `${where}.triggers`, trigger),
    edits,
    stutter: positive(source, 'stutter', where),
    quietPass: positive(source, 'quietPass', where),
    wrongWord: { names: textList(word, 'names', `${where}.wrongWord`), template: text(word, 'template', `${where}.wrongWord`), window: positive(word, 'window', `${where}.wrongWord`) },
    silhouettes: { near: positive(shadows, 'near', `${where}.silhouettes`), far: positive(shadows, 'far', `${where}.silhouettes`) },
  };
  check(def);
  return def;
}

export function glitchKnownOf(content: Content): GlitchKnown {
  const voids: string[] = [...content.zones.values()].filter((zone): boolean => zone.kind === 'void').map((zone): string => zone.id);
  return { props: new Set<string>(content.props.keys()), quests: new Set<string>(content.quests.keys()), voidZones: new Set<string>(voids) };
}

export function loadGlitches(): GlitchDef {
  return parseGlitches(glitches);
}
