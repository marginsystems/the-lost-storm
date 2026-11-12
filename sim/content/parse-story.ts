import type { Fields } from './read.ts';
import { byId, choice, ContentError, each, fields, flag, nonNegative, positive, text, textList } from './read.ts';
import { conditions } from './parse-conditions.ts';
import { FIND_MARKERS } from './story-types.ts';
import type { BookDef, EncounterFind, PageDef, StoryFlags, ZoneEncounter } from './story-types.ts';

export function storyFlags(value: unknown, where: string): StoryFlags {
  if (value === undefined) return {};
  const source: Fields = fields(value, where);
  const flags: Record<string, string> = {};
  for (const key of Object.keys(source)) flags[key] = text(source, key, where);
  return flags;
}

function find(value: unknown, where: string): EncounterFind {
  const source: Fields = fields(value, where);
  const type: EncounterFind['type'] = choice(source, 'type', ['item', 'exit'] as const, where);
  if (type === 'exit') return { type, exit: text(source, 'exit', where) };
  return { type, item: text(source, 'item', where), marker: source['marker'] === undefined ? 'none' : choice(source, 'marker', FIND_MARKERS, where), sets: storyFlags(source['sets'], `${where}.sets`), equip: source['equip'] === undefined ? false : flag(source, 'equip', where) };
}

export function encounter(value: unknown, where: string): ZoneEncounter {
  const source: Fields = fields(value, where);
  const found: ZoneEncounter['find'] = find(source['find'], `${where}.find`);
  const latest: number | null = source['latest'] === undefined ? null : positive(source, 'latest', where);
  if (latest !== null && found.type === 'item') throw new ContentError(`${where}.latest`, 'an item find cannot be laid under the hero: an item is only picked up by a click or tap on it');
  return {
    id: text(source, 'id', where),
    when: conditions(source, 'when', where),
    after: nonNegative(source, 'after', where),
    ahead: positive(source, 'ahead', where),
    latest,
    find: found,
  };
}

function page(value: unknown, where: string): PageDef {
  const source: Fields = fields(value, where);
  const lines: string[] = textList(source, 'lines', where);
  if (lines.length === 0) throw new ContentError(`${where}.lines`, 'a page needs at least one line');
  return {
    id: text(source, 'id', where),
    lines,
    address: text(source, 'address', where),
    unnamed: text(source, 'unnamed', where),
    when: conditions(source, 'when', where),
    sets: storyFlags(source['sets'], `${where}.sets`),
  };
}

function book(value: unknown, where: string): BookDef {
  const source: Fields = fields(value, where);
  const pages: PageDef[] = [...byId(each(source['pages'], `${where}.pages`, page), `${where}.pages`).values()];
  if (pages.length === 0) throw new ContentError(`${where}.pages`, 'a book needs at least one page');
  return { id: text(source, 'id', where), title: text(source, 'title', where), pages };
}

export function books(value: unknown, where: string): Map<string, BookDef> {
  return byId(each(value, where, book), where);
}
