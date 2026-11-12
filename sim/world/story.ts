import type { BookDef, PageDef, StoryFlags } from '../content/story-types.ts';
import type { ItemBaseDef } from '../content/types.ts';
import { bookOf } from '../content/story.ts';
import { allHold } from './conditions.ts';
import { startQuests } from './quests.ts';
import type { ItemInstance, World } from './types.ts';

export function setFlags(world: World, sets: StoryFlags): void {
  const keys: string[] = Object.keys(sets);
  if (keys.length === 0) return;
  for (const key of keys) {
    const value: string | undefined = sets[key];
    if (value !== undefined) world.flags[key] = value;
  }
  startQuests(world);
}

export function carriedBook(world: World, bookId: string): BookDef | null {
  for (const item of world.player.inventory) {
    if (item === null) continue;
    const base: ItemBaseDef | null = world.content.itemBases.get(item.base) ?? null;
    const book: BookDef | null = bookOf(world.content, base);
    if (book?.id === bookId) return book;
  }
  return null;
}

export function readablePages(world: World, book: BookDef): PageDef[] {
  return book.pages.filter((page: PageDef): boolean => allHold(world, page.when));
}

export function readPage(world: World, bookId: string, pageId: string): void {
  const book: BookDef | null = carriedBook(world, bookId);
  if (book === null) return;
  const page: PageDef | undefined = readablePages(world, book).find((entry: PageDef): boolean => entry.id === pageId);
  if (page !== undefined) setFlags(world, page.sets);
}

export function isBook(world: World, item: ItemInstance): boolean {
  return bookOf(world.content, world.content.itemBases.get(item.base) ?? null) !== null;
}
