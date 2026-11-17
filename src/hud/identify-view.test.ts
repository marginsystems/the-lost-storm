import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { AffixDef, Content } from '../../sim/content/types.ts';
import { identifyCost, revealed, veiled } from '../../sim/identify.ts';
import { generateItem } from '../../sim/items.ts';
import { createRng } from '../../sim/rng.ts';
import type { ItemInstance, RolledAffix, World } from '../../sim/world/types.ts';
import type { IdentifyView, RevealLine } from './identify-view.ts';
import { IDENTIFY_TEXT, identifyView, justRevealed, revealLines, rollQuality } from './identify-view.ts';

const content: Content = loadContent();

function made(rarity: string, level: number, uid: number, base: string | null = 'gale_charm'): ItemInstance {
  return must(generateItem(content, createRng(uid), uid, level, base, rarity), rarity);
}

function holding(gold: number, bag: readonly ItemInstance[], stash: readonly ItemInstance[]): World {
  const world: World = worldIn(content, content.world.town, 7);
  world.player.inventory.fill(null);
  world.stash.fill(null);
  bag.forEach((item: ItemInstance, index: number): void => {
    world.player.inventory[index] = item;
  });
  stash.forEach((item: ItemInstance, index: number): void => {
    world.stash[index] = item;
  });
  world.player.gold = gold;
  return world;
}

void test('the view lists each hidden item with its price, its shortfall and the total', (): void => {
  const first: ItemInstance = veiled(content, made('rare', 4, 1));
  const second: ItemInstance = veiled(content, made('rare', 9, 2));
  const priceOne: number = identifyCost(content, first);
  const priceTwo: number = identifyCost(content, second);
  const view: IdentifyView = identifyView(holding(priceOne, [first, made('magic', 3, 3)], [second]));
  assert.deepEqual(
    view.rows.map((row: IdentifyView['rows'][number]): readonly [string, number, number] => [row.place, row.cost, row.short]),
    [
      ['bag', priceOne, 0],
      ['stash', priceTwo, priceTwo - priceOne],
    ],
  );
  assert.equal(view.total, priceOne + priceTwo);
  assert.equal(view.allShort, priceTwo);
  assert.equal(view.gold, priceOne);
  assert.match(must(view.rows[0], 'row').kind, /^Rare /);
  assert.equal(IDENTIFY_TEXT.short(view.allShort), `${priceTwo} gold short`);
});

void test('with nothing hidden the view is empty and costs nothing', (): void => {
  const view: IdentifyView = identifyView(holding(50, [made('rare', 4, 4)], []));
  assert.equal(view.rows.length, 0);
  assert.equal(view.total, 0);
  assert.equal(view.allShort, 0);
});

void test('a roll at the top of its range scores one and at the bottom scores zero', (): void => {
  const item: ItemInstance = made('rare', 6, 5);
  const rolled: RolledAffix = must(item.affixes[0], 'affix');
  const affix: AffixDef = must(content.affixes.get(rolled.affix), 'affix def');
  const scale: number = 1 + affix.perLevel * (item.level - 1);
  if (affix.max === affix.min) return;
  assert.equal(rollQuality(content, { ...rolled, value: affix.max * scale }, item.level), 1);
  assert.equal(rollQuality(content, { ...rolled, value: affix.min * scale }, item.level), 0);
});

void test('the reveal shows every rolled line once, with the best roll last', (): void => {
  const item: ItemInstance = veiled(content, made('rare', 12, 6));
  const lines: readonly RevealLine[] = revealLines(content, item);
  const best: readonly RevealLine[] = lines.filter((line: RevealLine): boolean => line.best);
  assert.equal(best.length, item.affixes.length > 0 ? 1 : 0);
  if (best.length > 0) assert.equal(lines.at(-1)?.best, true);
  assert.ok(lines.length >= item.affixes.length);
});

void test('a Legendary reveals its power as the best and last line', (): void => {
  const item: ItemInstance = veiled(content, made('stormtouched', 12, 7, null));
  const lines: readonly RevealLine[] = revealLines(content, item);
  const last: RevealLine = must(lines.at(-1), 'last line');
  assert.equal(last.best, true);
  assert.equal(lines.filter((line: RevealLine): boolean => line.best).length, 1);
});

void test('an item counts as just revealed only once it was hidden and is no longer', (): void => {
  const item: ItemInstance = veiled(content, made('rare', 5, 8));
  const before: World = holding(0, [item], []);
  assert.deepEqual(justRevealed(before, new Set<number>([item.uid])), []);
  const after: World = holding(0, [revealed(item)], []);
  assert.deepEqual(
    justRevealed(after, new Set<number>([item.uid])).map((shown: ItemInstance): number => shown.uid),
    [item.uid],
  );
  assert.deepEqual(justRevealed(after, new Set<number>()), []);
});
