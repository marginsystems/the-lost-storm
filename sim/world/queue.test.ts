import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { spawnPacks } from './monsters.ts';
import { roomAhead } from './queue.ts';
import type { MonsterState, World } from './types.ts';

const content: Content = loadContent();

function crowdOf(spots: readonly Vec2[]): { world: World; monsters: MonsterState[] } {
  const world: World = worldIn(content, content.world.start, 3);
  world.monsters = [];
  world.zone = { ...world.zone, packs: spots.map((spot: Vec2) => ({ x: spot.x, z: spot.z, members: [{ monster: 'mender', count: 1, mods: [] }], when: [] })) };
  world.spawnedPacks = [];
  spawnPacks(world);
  world.monsters.forEach((monster: MonsterState, index: number): void => {
    const spot: Vec2 = must(spots[index], 'spot');
    monster.pos = { x: spot.x, z: spot.z };
  });
  return { world, monsters: world.monsters };
}

void test('the room ahead ends where the body squarely in front is touched', (): void => {
  const { world, monsters } = crowdOf([{ x: 10, z: 10 }, { x: 10, z: 13 }]);
  const walker: MonsterState = must(monsters[0], 'walker');
  const ahead: MonsterState = must(monsters[1], 'ahead');
  assert.ok(Math.abs(roomAhead(world, walker, 0) - (3 - walker.radius - ahead.radius)) < 1e-9);
});

void test('a body beside the line, behind, or fallen leaves the way open', (): void => {
  const { world, monsters } = crowdOf([{ x: 10, z: 10 }, { x: 11.5, z: 12 }, { x: 10, z: 7 }, { x: 10, z: 12 }]);
  const walker: MonsterState = must(monsters[0], 'walker');
  must(monsters[3], 'fallen').alive = false;
  assert.equal(roomAhead(world, walker, 0), Number.POSITIVE_INFINITY);
});

void test('a body already touching leaves no room at all', (): void => {
  const { world, monsters } = crowdOf([{ x: 10, z: 10 }, { x: 10, z: 10.5 }]);
  assert.equal(roomAhead(world, must(monsters[0], 'walker'), 0), 0);
});
