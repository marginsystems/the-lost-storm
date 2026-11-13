import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OUTPOST_CONTENT, OUTPOST_ZONE } from '../../test/road-support.ts';
import { must } from '../../test/support.ts';
import type { Content, ZoneDef, ZonePack } from '../content/types.ts';
import { createWorld } from './create.ts';
import { stepPackReturns } from './pack-return.ts';
import type { PackTimer } from './pack-return.ts';
import type { MonsterState, World } from './types.ts';
import { enterZone } from './zones.ts';

const RULES = { after: 20, away: 10 } as const;
const RETURNING: ZoneDef = { ...OUTPOST_ZONE, id: 'returning', surge: null, packReturn: RULES };

function worldIn(zone: ZoneDef): World {
  const content: Content = { ...OUTPOST_CONTENT, zones: new Map<string, ZoneDef>([...OUTPOST_CONTENT.zones, [zone.id, zone]]) };
  const world: World = createWorld(content, { seed: 9, save: null });
  enterZone(world, zone, { type: 'start' });
  world.events = [];
  return world;
}

function firstPack(world: World): PackTimer {
  return must(world.packReturns[0], 'first pack');
}

function firstPackFor(world: World, pack: ZonePack): PackTimer {
  return must(world.packReturns.find((timer: PackTimer): boolean => timer.pack === pack), 'returned pack');
}

function kill(world: World, packId: number): void {
  for (const monster of world.monsters) {
    if (monster.packId !== packId) continue;
    monster.alive = false;
    monster.life = 0;
  }
}

function living(world: World, pack: ZonePack): MonsterState[] {
  const ids: Set<number> = new Set<number>(world.packReturns.filter((timer: PackTimer): boolean => timer.pack === pack).map((timer: PackTimer): number => timer.packId));
  return world.monsters.filter((monster: MonsterState): boolean => monster.alive && ids.has(monster.packId));
}

function run(world: World, seconds: number): void {
  const dt: number = 0.5;
  for (let elapsed: number = 0; elapsed < seconds; elapsed += dt) stepPackReturns(world, dt);
}

void test('a cleared pack comes back whole once its time is up and the hero is away', (): void => {
  const world: World = worldIn(RETURNING);
  const timer: PackTimer = firstPack(world);
  const size: number = world.monsters.filter((monster: MonsterState): boolean => monster.packId === timer.packId).length;
  kill(world, timer.packId);
  world.player.pos = { x: timer.pack.x + RULES.away + 2, z: timer.pack.z };
  run(world, RULES.after - 1);
  assert.equal(living(world, timer.pack).length, 0);
  run(world, 2);
  assert.equal(living(world, timer.pack).length, size);
  assert.ok(world.events.some((event): boolean => event.type === 'monster_spawn'));
  assert.notEqual(firstPackFor(world, timer.pack).packId, timer.packId);
});

void test('a pack never comes back while the hero stands where it was', (): void => {
  const world: World = worldIn(RETURNING);
  const timer: PackTimer = firstPack(world);
  kill(world, timer.packId);
  world.player.pos = { x: timer.pack.x + 1, z: timer.pack.z };
  run(world, RULES.after * 3);
  assert.equal(living(world, timer.pack).length, 0);
  world.player.pos = { x: timer.pack.x + RULES.away + 2, z: timer.pack.z };
  run(world, 1);
  assert.ok(living(world, timer.pack).length > 0);
});

void test('a pack with one member alive does not start its clock', (): void => {
  const world: World = worldIn(RETURNING);
  const timer: PackTimer = firstPack(world);
  const members: MonsterState[] = world.monsters.filter((monster: MonsterState): boolean => monster.packId === timer.packId);
  for (const monster of members.slice(1)) monster.alive = false;
  world.player.pos = { x: timer.pack.x + RULES.away + 2, z: timer.pack.z };
  run(world, RULES.after * 2);
  assert.equal(timer.left, null);
  assert.equal(world.monsters.filter((monster: MonsterState): boolean => monster.packId === timer.packId && monster.alive).length, 1);
});

void test('a zone without return rules keeps its dead packs dead', (): void => {
  const world: World = worldIn({ ...RETURNING, id: 'still', packReturn: null });
  assert.deepEqual(world.packReturns, []);
  const before: number = world.monsters.length;
  for (const monster of world.monsters) monster.alive = false;
  run(world, 200);
  assert.equal(world.monsters.filter((monster: MonsterState): boolean => monster.alive).length, 0);
  assert.equal(world.monsters.length, before);
});
