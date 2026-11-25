import assert from 'node:assert/strict';
import { test } from 'node:test';
import { armed, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { countOf, stackSize } from '../stacks.ts';
import { stepWorld } from './step.ts';
import type { Command, ItemInstance, World, WorldEvent } from './types.ts';

const content: Content = loadContent();

const BLADE: ItemInstance = { uid: 5100, base: 'rusted_blade', rarity: 'common', level: 1, affixes: [], ledger: null };
const JOURNAL: ItemInstance = { uid: 5200, base: 'worn_journal', rarity: 'common', level: 1, affixes: [], ledger: null };

function bag(): World {
  const world: World = armed(worldIn(content, 'hideout', 1));
  world.player.inventory.fill(null);
  return world;
}

function send(world: World, command: Command): WorldEvent[] {
  return stepWorld(world, [command], 1 / 60);
}

function countAt(world: World, index: number): number {
  const item: ItemInstance | null = world.player.inventory[index] ?? null;
  return item === null ? 0 : countOf(item);
}

function hour(uid: number, count: number): ItemInstance {
  return { uid, base: 'folded_hour', rarity: 'common', level: 1, affixes: [], ledger: null, count };
}

void test('an item moved onto an empty place in the bag lands there and leaves its old place empty', (): void => {
  const world: World = bag();
  world.player.inventory[0] = BLADE;
  const events: WorldEvent[] = send(world, { type: 'arrange', from: 0, to: 9 });
  assert.equal(world.player.inventory[0], null);
  assert.equal(world.player.inventory[9], BLADE);
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'character_changed'));
});

void test('an item moved onto another swaps the two, story items included', (): void => {
  const world: World = bag();
  world.player.inventory[1] = BLADE;
  world.player.inventory[4] = JOURNAL;
  send(world, { type: 'arrange', from: 4, to: 1 });
  assert.equal(world.player.inventory[1], JOURNAL);
  assert.equal(world.player.inventory[4], BLADE);
});

void test('a stack moved onto a stack of the same kind fills it, keeps what does not fit, and swaps with a full one', (): void => {
  const size: number = stackSize(content, hour(1, 1));
  assert.ok(size > 2);
  const world: World = bag();
  world.player.inventory[0] = hour(5301, 2);
  world.player.inventory[3] = hour(5302, size - 1);
  send(world, { type: 'arrange', from: 0, to: 3 });
  assert.equal(countAt(world, 3), size);
  assert.equal(countAt(world, 0), 1);
  send(world, { type: 'arrange', from: 0, to: 3 });
  assert.equal(countAt(world, 0), size);
  assert.equal(countAt(world, 3), 1);
});

void test('a move from an empty place, onto itself or past the bag changes nothing', (): void => {
  const world: World = bag();
  world.player.inventory[2] = BLADE;
  const before: readonly (ItemInstance | null)[] = [...world.player.inventory];
  const moves: readonly Command[] = [
    { type: 'arrange', from: 0, to: 2 },
    { type: 'arrange', from: 2, to: 2 },
    { type: 'arrange', from: 2, to: -1 },
    { type: 'arrange', from: 2, to: world.player.inventory.length },
  ];
  for (const command of moves) {
    const events: WorldEvent[] = send(world, command);
    assert.ok(!events.some((event: WorldEvent): boolean => event.type === 'character_changed'));
  }
  assert.deepEqual(world.player.inventory, before);
});
