import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { ItemBaseDef } from '../../sim/content/types.ts';
import { createWorld } from '../../sim/world/create.ts';
import type { World } from '../../sim/world/types.ts';
import { worldIn } from '../../test/support.ts';
import { keptAsKeepsake, zoneFinds } from './loot-view.ts';

void test('the opening mist warms every item it can lay in front of the hero, before it is laid', (): void => {
  const world: World = createWorld(loadContent(), { seed: 2, save: null, opening: true });
  const finds: ItemBaseDef[] = zoneFinds(world);
  const expected: string[] = (world.zone.void?.encounters ?? []).flatMap((met): string[] => (met.find.type === 'item' ? [met.find.item] : []));
  assert.ok(expected.length > 0);
  assert.deepEqual(finds.map((base: ItemBaseDef): string => base.id), expected);
  assert.ok(finds.some((base: ItemBaseDef): boolean => !keptAsKeepsake(base)));
});

void test('a zone with no encounters has no finds to warm', (): void => {
  const content = loadContent();
  const town: World = worldIn(content, 'hall_of_time', 1);
  assert.deepEqual(zoneFinds(town), []);
});
