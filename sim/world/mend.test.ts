import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arena } from '../../test/arena-support.ts';
import { leechActor, leechRoom, mendActor } from './mend.ts';
import type { World, WorldEvent } from './types.ts';

void test('mending adds life up to the most, tells how much it gave, and gives nothing to the dead or the full', (): void => {
  const world: World = arena(1);
  const player = world.player;
  player.life = player.maxLife - 5;
  mendActor(world, player, 20);
  assert.equal(player.life, player.maxLife);
  assert.deepEqual(world.events.filter((event: WorldEvent): boolean => event.type === 'mend'), [{ type: 'mend', actorId: player.id, amount: 5 }]);
  mendActor(world, player, 20);
  player.alive = false;
  player.life = 1;
  mendActor(world, player, 20);
  assert.equal(player.life, 1);
  assert.equal(world.events.filter((event: WorldEvent): boolean => event.type === 'mend').length, 1);
});

void test('leech gives at most its share of most life in a second, and what a hit would give past it is lost, not kept for later', (): void => {
  const world: World = arena(1);
  const player = world.player;
  const rate: number = player.maxLife * world.content.world.recovery.leechCap;
  player.life = 1;
  assert.equal(leechActor(world, player, rate * 3), rate);
  assert.equal(player.life, 1 + rate);
  assert.equal(leechActor(world, player, rate), 0);
  world.time += 0.5;
  assert.ok(Math.abs(leechRoom(world, player) - rate * 0.5) < 1e-9);
  assert.ok(Math.abs(leechActor(world, player, rate * 3) - rate * 0.5) < 1e-9);
  world.time += 10;
  assert.ok(Math.abs(leechRoom(world, player) - rate) < 1e-9);
  assert.ok(Math.abs(leechActor(world, player, rate * 3) - rate) < 1e-9);
});

void test('leech at full life spends none of the share for that second', (): void => {
  const world: World = arena(1);
  const player = world.player;
  const rate: number = player.maxLife * world.content.world.recovery.leechCap;
  player.life = player.maxLife;
  assert.equal(leechActor(world, player, rate), 0);
  player.life = player.maxLife - rate;
  assert.ok(Math.abs(leechActor(world, player, rate * 2) - rate) < 1e-9);
});
