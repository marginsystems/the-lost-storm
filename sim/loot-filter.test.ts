import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content/content.ts';
import { matchLoot, readLootFilter } from './loot-filter.ts';
import type { ItemInstance } from './world/types.ts';

void test('a rarity can allow any slot, no slots, or just the wanted pieces before identification', (): void => {
  const content = loadContent();
  const filter = readLootFilter({ common: [], magic: [], rare: ['hands', 'feet', 'missing'], stormtouched: null });
  const item: ItemInstance = { uid: 1, base: 'mudcaked_boots', rarity: 'rare', unidentified: true, affixes: [], level: 1, ledger: null };
  assert.deepEqual(filter, { common: [], magic: [], rare: ['hands', 'feet'] });
  assert.equal(matchLoot(content, filter, item), 'wanted');
  assert.equal(matchLoot(content, filter, { ...item, base: 'rusted_blade' }), 'hidden');
  assert.equal(matchLoot(content, filter, { ...item, rarity: 'magic' }), 'hidden');
  assert.equal(matchLoot(content, filter, { ...item, rarity: 'stormtouched' }), 'ordinary');
  assert.equal(matchLoot(content, filter, { ...item, base: 'worn_journal', rarity: 'common' }), 'essential');
});
