import raw from '../../data/hints.json' with { type: 'json' };
import type { Fields } from './read.ts';
import type { SkillUnlock } from './shape-types.ts';
import { ContentError, each, fields, items, numeric, text, textList, flag, choice, nullableText } from './read.ts';
import type { Content } from './types.ts';

export const HINT_PANELS = ['inventory', 'tree', 'map'] as const;
export type HintPanel = (typeof HINT_PANELS)[number];

export const STATIC_KEYS = ['inventory', 'tree', 'map', 'flask'] as const;
export const SLOT_KEY: RegExp = /^slot_([1-9])$/;
export const DESK_WORDS: RegExp = /\b(click\w*|press(es|ed|ing)?|mouse|mice|keyboards?|keys?)\b/i;

export type HintTrigger =
  | { readonly type: 'game_started' }
  | { readonly type: 'objective_person' }
  | { readonly type: 'objective_exit' }
  | { readonly type: 'waypoint_near'; readonly range: number }
  | { readonly type: 'monster_near'; readonly range: number }
  | { readonly type: 'item_near'; readonly range: number }
  | { readonly type: 'skill_point' }
  | { readonly type: 'skill_learned'; readonly skill: string }
  | { readonly type: 'slot_filled'; readonly slot: number }
  | { readonly type: 'gear_in_bag' }
  | { readonly type: 'low_life'; readonly fraction: number; readonly carrying: string | null }
  | { readonly type: 'player_dead' }
  | { readonly type: 'in_moment' };

export type HintDone =
  | { readonly type: 'moved'; readonly distance: number }
  | { readonly type: 'talked' }
  | { readonly type: 'panel'; readonly panel: HintPanel }
  | { readonly type: 'zone_changed' }
  | { readonly type: 'skills_used'; readonly slots: readonly number[] }
  | { readonly type: 'picked_up' }
  | { readonly type: 'equipped' }
  | { readonly type: 'allocated' }
  | { readonly type: 'life_above'; readonly fraction: number }
  | { readonly type: 'alive' }
  | { readonly type: 'moment_over' };

export interface HintDef {
  readonly id: string;
  readonly trigger: HintTrigger;
  readonly text: string;
  readonly touch: string;
  readonly done: HintDone;
  readonly after: readonly string[];
  readonly forNewPlayers: boolean;
}

export interface HintsDef {
  readonly hints: readonly HintDef[];
}

export type HintSegment = { readonly type: 'words'; readonly text: string } | { readonly type: 'key'; readonly name: string };

const PLACEHOLDER: RegExp = /\{([a-z_0-9]+)\}/g;

export function hintSegments(template: string): HintSegment[] {
  const segments: HintSegment[] = [];
  let from: number = 0;
  for (const match of template.matchAll(PLACEHOLDER)) {
    const name: string | undefined = match[1];
    if (name === undefined) continue;
    if (match.index > from) segments.push({ type: 'words', text: template.slice(from, match.index) });
    segments.push({ type: 'key', name });
    from = match.index + match[0].length;
  }
  if (from < template.length) segments.push({ type: 'words', text: template.slice(from) });
  return segments;
}

function readTrigger(value: unknown, where: string): HintTrigger {
  const source: Fields = fields(value, where);
  const type = choice(source, 'type', ['game_started', 'objective_person', 'objective_exit', 'waypoint_near', 'monster_near', 'item_near', 'skill_point', 'skill_learned', 'slot_filled', 'gear_in_bag', 'low_life', 'player_dead', 'in_moment'] as const, where);
  let trigger: HintTrigger;
  switch (type) {
    case 'game_started':
    case 'objective_person':
    case 'objective_exit':
    case 'skill_point':
    case 'gear_in_bag':
    case 'player_dead':
    case 'in_moment':
      trigger = { type };
      break;
    case 'waypoint_near':
    case 'monster_near':
    case 'item_near':
      trigger = { type, range: numeric(source, 'range', where) };
      break;
    case 'skill_learned':
      trigger = { type, skill: text(source, 'skill', where) };
      break;
    case 'slot_filled':
      trigger = { type, slot: numeric(source, 'slot', where) };
      break;
    case 'low_life':
      trigger = { type, fraction: numeric(source, 'fraction', where), carrying: nullableText(source, 'carrying', where) };
      break;
  }
  return trigger;
}

function readSlots(value: unknown, where: string): number[] {
  return items(value, where).map((slot: unknown): number => {
    if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0) throw new ContentError(where, 'expected slot numbers');
    return slot;
  });
}

function readDone(value: unknown, where: string): HintDone {
  const source: Fields = fields(value, where);
  const type = choice(source, 'type', ['moved', 'talked', 'panel', 'zone_changed', 'skills_used', 'picked_up', 'equipped', 'allocated', 'life_above', 'alive', 'moment_over'] as const, where);
  let done: HintDone;
  switch (type) {
    case 'talked':
    case 'zone_changed':
    case 'picked_up':
    case 'equipped':
    case 'allocated':
    case 'alive':
    case 'moment_over':
      done = { type };
      break;
    case 'moved':
      done = { type, distance: numeric(source, 'distance', where) };
      break;
    case 'panel':
      done = { type, panel: choice(source, 'panel', HINT_PANELS, where) };
      break;
    case 'skills_used':
      done = { type, slots: readSlots(source['slots'], `${where}.slots`) };
      break;
    case 'life_above':
      done = { type, fraction: numeric(source, 'fraction', where) };
      break;
  }
  return done;
}

function readHint(value: unknown, where: string): HintDef {
  const source: Fields = fields(value, where);
  return {
    id: text(source, 'id', where),
    trigger: readTrigger(source['trigger'], `${where}.trigger`),
    text: text(source, 'text', where),
    touch: text(source, 'touch', where),
    done: readDone(source['done'], `${where}.done`),
    after: textList(source, 'after', where),
    forNewPlayers: flag(source, 'forNewPlayers', where),
  };
}

export function parseHints(value: unknown): HintsDef {
  const source: Fields = fields(value, 'hints');
  const hints: HintDef[] = each(source['hints'], 'hints.hints', readHint);
  const ids: Set<string> = new Set<string>();
  for (const hint of hints) {
    if (ids.has(hint.id)) throw new ContentError('hints', `duplicate id ${hint.id}`);
    for (const earlier of hint.after) {
      if (!ids.has(earlier)) throw new ContentError(`hints.${hint.id}`, `after ${earlier} must come earlier in the file`);
    }
    ids.add(hint.id);
  }
  return { hints };
}

function keyNames(template: string): ReadonlySet<string> {
  return new Set<string>(hintSegments(template).flatMap((segment: HintSegment): string[] => (segment.type === 'key' ? [segment.name] : [])));
}

export function hintProblems(defs: HintsDef, content: Content): string[] {
  const problems: string[] = [];
  const slots: number = content.player.skillBar.length;
  for (const hint of defs.hints) {
    const trigger: HintTrigger = hint.trigger;
    if (trigger.type === 'skill_learned' && !content.player.skillBook.some((entry: SkillUnlock): boolean => entry.skill === trigger.skill)) problems.push(`${hint.id}: skill ${trigger.skill} is not in the skill book`);
    if (trigger.type === 'slot_filled' && !(Number.isInteger(trigger.slot) && trigger.slot >= 0 && trigger.slot < slots)) problems.push(`${hint.id}: skill slot ${trigger.slot} does not exist`);
    if (hint.done.type === 'skills_used') {
      for (const slot of hint.done.slots) {
        if (slot >= slots) problems.push(`${hint.id}: skill slot ${slot} does not exist`);
      }
    }
    for (const segment of [...hintSegments(hint.text), ...hintSegments(hint.touch)]) {
      if (segment.type !== 'key') continue;
      const slot: RegExpMatchArray | null = segment.name.match(SLOT_KEY);
      const known: boolean = STATIC_KEYS.some((name: string): boolean => name === segment.name) || (slot !== null && Number(slot[1]) <= slots);
      if (!known) problems.push(`${hint.id}: unknown key {${segment.name}}`);
    }
    const deskKeys: ReadonlySet<string> = keyNames(hint.text);
    for (const name of keyNames(hint.touch)) {
      if (!deskKeys.has(name)) problems.push(`${hint.id}: touch wording names {${name}}, which the desk wording does not`);
    }
    if (DESK_WORDS.test(hint.touch)) problems.push(`${hint.id}: touch wording names a mouse or keyboard action`);
  }
  return problems;
}

export function hintWording(hint: HintDef, touch: boolean): string {
  return touch ? hint.touch : hint.text;
}

export function loadHints(content: Content): HintsDef {
  const defs: HintsDef = parseHints(raw);
  const problems: string[] = hintProblems(defs, content);
  if (problems.length > 0) throw new ContentError('hints', problems.join('; '));
  return defs;
}
