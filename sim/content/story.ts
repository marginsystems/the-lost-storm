import type { BookDef, ZoneEncounter } from './story-types.ts';
import type { Content, ItemBaseDef, ZoneDef } from './types.ts';
import { roadFlagNames } from './road.ts';

export function storyFlagNames(content: Content): ReadonlySet<string> {
  const names: Set<string> = new Set<string>(Object.keys(content.world.legacyFlags));
  for (const zone of content.zones.values()) {
    for (const met of zone.void?.encounters ?? []) if (met.find.type === 'item') for (const key of Object.keys(met.find.sets)) names.add(key);
  }
  for (const book of content.books.values()) for (const page of book.pages) for (const key of Object.keys(page.sets)) names.add(key);
  for (const key of roadFlagNames(content)) names.add(key);
  return names;
}

function encounterProblems(content: Content, zone: ZoneDef, met: ZoneEncounter): string[] {
  const at: string = `zone ${zone.id} encounter ${met.id}`;
  let problems: string[] = [];
  switch (met.find.type) {
    case 'item':
      if (!content.itemBases.has(met.find.item)) problems = [`${at} finds unknown item ${met.find.item}`];
      break;
    case 'exit': {
      const exitId: string = met.find.exit;
      if (!zone.exits.some((exit): boolean => exit.id === exitId)) problems = [`${at} places unknown exit ${exitId}`];
      break;
    }
  }
  return problems;
}

export function storyProblems(content: Content): string[] {
  const problems: string[] = [];
  for (const base of content.itemBases.values()) {
    const at: string = `item ${base.id}`;
    if ((base.slot === null) !== (base.book !== null)) problems.push(`${at} must have either a slot or a book, not both or neither`);
    if (base.book !== null && !content.books.has(base.book)) problems.push(`${at} is unknown book ${base.book}`);
    if (base.book !== null && base.dropWeight > 0) problems.push(`${at} is a book and cannot drop at random`);
  }
  const shelved: Set<string> = new Set<string>([...content.itemBases.values()].flatMap((base: ItemBaseDef): string[] => (base.book === null ? [] : [base.book])));
  for (const book of content.books.values()) {
    if (!shelved.has(book.id)) problems.push(`book ${book.id} is not the book of any item`);
  }
  for (const zone of content.zones.values()) for (const met of zone.void?.encounters ?? []) problems.push(...encounterProblems(content, zone, met));
  return problems;
}

export function bookOf(content: Content, base: ItemBaseDef | null): BookDef | null {
  return base === null || base.book === null ? null : (content.books.get(base.book) ?? null);
}
