import type { Fields } from './read.ts';
import { byId, ContentError, each, fields, fraction, nonNegative, numeric, positive, text, textList } from './read.ts';
import { conditions } from './parse-conditions.ts';
import { storyFlags } from './parse-story.ts';
import type { Condition } from './condition-types.ts';
import type { StoryFlags } from './story-types.ts';
import type { ActEnd, RetiredZones, ZoneDrift, ZoneTrigger } from './road-types.ts';

function wholeAtLeast(source: Fields, key: string, min: number, where: string): number {
  const value: number = numeric(source, key, where);
  if (!Number.isInteger(value) || value < min) throw new ContentError(`${where}.${key}`, `expected a whole number of at least ${min}`);
  return value;
}

function drift(value: unknown, where: string): ZoneDrift {
  const source: Fields = fields(value, where);
  const period: number = positive(source, 'period', where);
  const open: number = fraction(source, 'open', where);
  const fade: number = nonNegative(source, 'fade', where);
  if (open <= 0 || open >= 1) throw new ContentError(`${where}.open`, 'a drift is open for part of its period, more than none and less than all of it');
  if (fade * 2 > period * Math.min(open, 1 - open)) throw new ContentError(`${where}.fade`, 'a fade must fit twice inside both the open and the closed part of the period');
  return {
    id: text(source, 'id', where),
    column: wholeAtLeast(source, 'column', 0, where),
    row: wholeAtLeast(source, 'row', 0, where),
    columns: wholeAtLeast(source, 'columns', 1, where),
    rows: wholeAtLeast(source, 'rows', 1, where),
    period,
    open,
    offset: nonNegative(source, 'offset', where),
    fade,
  };
}

export function drifts(value: unknown, where: string): ZoneDrift[] {
  if (value === undefined) return [];
  return [...byId(each(value, where, drift), where).values()];
}

function trigger(value: unknown, where: string): ZoneTrigger {
  const source: Fields = fields(value, where);
  const sets: StoryFlags = storyFlags(source['sets'], `${where}.sets`);
  if (Object.keys(sets).length === 0) throw new ContentError(`${where}.sets`, 'a trigger sets at least one flag');
  return { id: text(source, 'id', where), x: numeric(source, 'x', where), z: numeric(source, 'z', where), radius: positive(source, 'radius', where), when: conditions(source, 'when', where), sets };
}

export function triggers(value: unknown, where: string): ZoneTrigger[] {
  if (value === undefined) return [];
  return [...byId(each(value, where, trigger), where).values()];
}

export function actEnd(value: unknown, where: string): ActEnd | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  const when: Condition[] = conditions(source, 'when', where);
  if (when.length === 0) throw new ContentError(`${where}.when`, 'an act ends on at least one condition');
  return { when, line: text(source, 'line', where) };
}

export function retiredZones(value: unknown, where: string): RetiredZones | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  return { zones: textList(source, 'zones', where), to: text(source, 'to', where), flags: storyFlags(source['flags'], `${where}.flags`) };
}
