import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { generateItem } from '../items.ts';
import { createRng } from '../rng.ts';
import { armedFlag, toldFlag } from '../save-arm.ts';
import { parseSaveText, toSave } from '../save.ts';
import type { SaveData } from '../save.ts';
import { announceArming } from './arming.ts';
import { createWorld } from './create.ts';
import { stepWorld } from './step.ts';
import type { ItemInstance, World, WorldEvent } from './types.ts';

const content: Content = loadContent();

function armedEvents(events: readonly WorldEvent[]): readonly WorldEvent[] {
  return events.filter((event: WorldEvent): boolean => event.type === 'armed');
}

function reload(world: World): World {
  const save: SaveData = must(parseSaveText(content, JSON.stringify(toSave(world))), 'save');
  return createWorld(content, { seed: 2, save });
}

void test('a starter laid on load is announced on the first step only, and it stays marked as laid', (): void => {
  const world: World = createWorld(content, { seed: 2, save: null });
  world.flags[armedFlag('staff')] = 'bag';
  assert.deepEqual(armedEvents(stepWorld(world, [], 0.01)), [{ type: 'armed', group: 'staff', base: 'driftwood_staff', where: 'bag' }]);
  assert.equal(world.flags[armedFlag('staff')], 'bag');
  assert.equal(world.flags[toldFlag('staff')], 'yes');
  assert.deepEqual(armedEvents(stepWorld(world, [], 0.01)), []);
});

void test('a starter that fell to the ground is announced there, and a group never armed or already told says nothing', (): void => {
  const world: World = createWorld(content, { seed: 2, save: null });
  world.flags[armedFlag('heavy')] = 'ground';
  world.flags[armedFlag('crossbow')] = 'bag';
  world.flags[toldFlag('crossbow')] = 'yes';
  world.events = [];
  announceArming(world);
  assert.deepEqual(armedEvents(world.events), [{ type: 'armed', group: 'heavy', base: 'tempest_greatsword', where: 'ground' }]);
});

void test('a character armed before the announcement existed is told once on the next load, and never after', (): void => {
  const armedEarlier: World = createWorld(content, { seed: 2, save: null });
  armedEarlier.player.level = 13;
  armedEarlier.player.allocated = ['storm_storm_bolt'];
  armedEarlier.player.inventory[0] = must(generateItem(content, createRng(70), 70, 13, 'driftwood_staff', 'common'), 'staff');
  armedEarlier.flags[armedFlag('staff')] = 'yes';
  const loaded: World = reload(armedEarlier);
  assert.equal(loaded.player.inventory.filter((item: ItemInstance | null): boolean => item?.base === 'driftwood_staff').length, 1);
  assert.deepEqual(armedEvents(stepWorld(loaded, [], 0.01)), [{ type: 'armed', group: 'staff', base: 'driftwood_staff', where: null }]);
  const again: World = reload(loaded);
  assert.deepEqual(armedEvents(stepWorld(again, [], 0.01)), []);
  assert.equal(again.player.inventory.filter((item: ItemInstance | null): boolean => item?.base === 'driftwood_staff').length, 1);
});
