import assert from 'node:assert/strict';
import { test } from 'node:test';
import { played, roundTrip, saveContent } from '../../test/save-support.ts';
import { toSave } from '../save.ts';
import type { SaveData } from '../save.ts';
import { adoptWorld } from './adopt.ts';
import { createWorld } from './create.ts';
import type { PlayerState, World } from './types.ts';
import { stepWorld } from './step.ts';

void test('a world takes another character in place and keeps its own player object', (): void => {
  const world: World = createWorld(saveContent, { seed: 1, save: null });
  const player: PlayerState = world.player;
  const heroes: PlayerState[] = world.heroes;
  const other: SaveData = roundTrip(played());
  adoptWorld(world, { seed: 2, save: other });
  assert.equal(world.player, player);
  assert.equal(world.heroes, heroes);
  assert.deepEqual(world.heroes, [player]);
  assert.equal(world.player.level, 4);
  assert.equal(world.player.gold, 123);
  assert.deepEqual(toSave(world), toSave(createWorld(saveContent, { seed: 2, save: other })));
});

void test('a world taken back from a played character starts fresh again', (): void => {
  const world: World = played();
  adoptWorld(world, { seed: 3, save: null, opening: true });
  assert.equal(world.player.level, 1);
  assert.equal(world.player.gold, 0);
  assert.deepEqual(toSave(world), toSave(createWorld(saveContent, { seed: 3, save: null, opening: true })));
});

void test('the ids of the adopted world carry on from the old ones, so no actor id is used twice', (): void => {
  const world: World = createWorld(saveContent, { seed: 1, save: null });
  const before: ReadonlySet<number> = new Set<number>(world.monsters.map((monster): number => monster.id));
  const reached: number = world.nextId;
  adoptWorld(world, { seed: 1, save: null });
  assert.ok(world.monsters.length > 0);
  for (const monster of world.monsters) {
    assert.ok(monster.id >= reached);
    assert.ok(!before.has(monster.id));
  }
  assert.equal(world.player.id, 1);
});

void test('the explored revision only climbs, so a map drawn from the old world redraws', (): void => {
  const world: World = played();
  const revision: number = world.exploredRevision;
  adoptWorld(world, { seed: 4, save: null });
  assert.ok(world.exploredRevision > revision);
});

void test('the adopted world steps like a fresh one', (): void => {
  const world: World = played();
  adoptWorld(world, { seed: 5, save: roundTrip(played()) });
  stepWorld(world, [], 0.1);
  assert.equal(world.player.alive, true);
});
