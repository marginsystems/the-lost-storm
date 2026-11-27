import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import { handleTrade, meetNpc, sellPrice } from './trade.ts';
import type { ItemInstance } from './types.ts';

void test('a batch sale follows the offered items after rearrangement, pays once and leaves protected items alone', (): void => {
  const content = loadContent();
  const world = worldIn(content, content.world.town, 3);
  const npc = must(world.npcs.find((entry): boolean => entry.def.service === 'vendor'), 'vendor');
  world.heard.push(...npc.def.talks.filter((talk): boolean => talk.once).map((talk): string => talk.id));
  meetNpc(world, npc);
  const blade: ItemInstance = { uid: 900, base: 'rusted_blade', rarity: 'common', ledger: null, level: 1, affixes: [] };
  const boots = { ...blade, uid: 901, base: 'mudcaked_boots' };
  const book = { ...blade, uid: 902, base: 'worn_journal' };
  world.player.inventory.splice(0, 4, book, boots, null, blade);
  const before = world.player.gold;
  const action = { type: 'sell_many', uids: [901, 900, 900, 999, 902] } as const;
  handleTrade(world, action);
  handleTrade(world, action);
  assert.equal(world.player.gold, before + sellPrice(content, blade) + sellPrice(content, boots));
  assert.deepEqual(world.player.inventory.slice(0, 4), [book, null, null, null]);
  assert.deepEqual(world.vendors[npc.def.id]?.buyback, [blade, boots]);
});
