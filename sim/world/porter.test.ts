import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn, zoneOf } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import { readSave, toSave } from '../save.ts';
import { createWorld } from './create.ts';
import { dropOnGround } from './ground.ts';
import { stepWorld } from './step.ts';
import { meetNpc, stepTrade } from './trade.ts';
import type { GroundItem, ItemInstance, World } from './types.ts';
import { enterZone } from './zones.ts';

const content = loadContent();
const offer = content.trade.porter;
const now: number = 1700000000000;
const dt: number = 1 / 30;

function atPorter(world: World): void {
  stepTrade(world);
  const npc = must(world.npcs.find((entry): boolean => entry.def.service === 'porter'), 'porter');
  world.player.pos = { ...npc.pos };
  meetNpc(world, npc);
}

function equipment(world: World, base: string): GroundItem {
  const item: ItemInstance = { uid: world.nextItemUid++, rarity: 'rare', base, affixes: [], ledger: null, unidentified: true, level: 1 };
  const ground = dropOnGround(world, world.player.pos, { kind: 'item', item });
  ground.pos = { ...world.player.pos };
  ground.age = 1;
  return ground;
}

void test('the hourly hire follows through zones, keeps wanted gear in its own satchel and honors the deadline across reload', (): void => {
  const world = worldIn(content, content.world.town, 13);
  atPorter(world);
  const clock = { now, loot: { rare: ['feet', 'hands'] as const } };
  const hire = { type: 'trade', action: { type: 'hire_porter' } } as const;
  world.player.gold = offer.price - 1;
  stepWorld(world, [hire], dt, clock);
  assert.equal(world.porterUntil, 0);
  world.player.gold = offer.price * 3;
  assert.ok(stepWorld(world, [hire, hire], dt, clock).some((event): boolean => event.type === 'character_changed'));
  const expires: number = world.porterUntil;
  assert.ok(Math.abs(expires - (now + offer.durationMs)) < 100);
  assert.equal(world.player.gold, offer.price * 2);
  enterZone(world, zoneOf(content, 'hall_of_time'), { type: 'start' });
  stepWorld(world, [], dt, clock);
  const sword = equipment(world, 'rusted_blade');
  const boots = equipment(world, 'mudcaked_boots');
  const discarded = equipment(world, 'mudcaked_boots');
  discarded.discarded = true;
  for (let tick: number = 0; tick < 30; tick += 1) stepWorld(world, [], dt, clock);
  assert.ok(world.porter !== null && world.npcs.includes(world.porter));
  assert.equal(world.ground.includes(boots), false);
  assert.ok(world.ground.includes(sword) && world.ground.includes(discarded));
  const carried = must(world.satchel[0], 'collected boots');
  assert.equal(carried.unidentified, true);
  assert.ok(!world.player.inventory.includes(carried));
  const saved = must(readSave(content, toSave(world)), 'saved');
  const loaded = createWorld(content, { seed: 12, save: saved, now: expires });
  assert.equal(toSave(loaded).porterUntil, 0);
  stepWorld(loaded, [], dt, { ...clock, now: expires });
  assert.equal(loaded.porter, null);
  assert.deepEqual(loaded.satchel[0], carried);
  enterZone(loaded, zoneOf(content, content.world.town), { type: 'start' });
  atPorter(loaded);
  const take = { type: 'trade', action: { type: 'take_satchel', uid: carried.uid } } as const;
  stepWorld(loaded, [take, take], dt, { ...clock, now: expires });
  assert.equal(loaded.satchel[0], null);
  assert.equal(loaded.player.inventory.filter((item): boolean => item?.uid === carried.uid).length, 1);
});
