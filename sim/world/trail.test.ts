import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, ARENA_CONTENT, arena, place } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import type { MonsterModDef, MonsterTrail } from '../content/combat-types.ts';
import { withMods } from './elites.ts';
import { stepTrail, trailAreas } from './trail.ts';
import type { MonsterState, World } from './types.ts';

const smouldering: MonsterModDef = must(ARENA_CONTENT.monsterMods.get('smouldering'), 'smouldering');
const wake: MonsterTrail = must(smouldering.trail, 'smouldering trail');

function burning(world: World): MonsterState {
  const placed: MonsterState = place(world, 'unfinished_brute', ARENA_CENTRE);
  const monster: MonsterState = { ...placed, def: withMods(placed.def, [smouldering]), aggro: true, trailFrom: { x: placed.pos.x, z: placed.pos.z } };
  world.monsters[world.monsters.indexOf(placed)] = monster;
  return monster;
}

function walk(world: World, monster: MonsterState, metres: number): void {
  const steps: number = Math.ceil(metres / 0.1);
  for (let step: number = 0; step < steps; step += 1) {
    monster.pos.x += 0.1;
    stepTrail(world, monster);
  }
}

void test('a smouldering monster on the hunt leaves burning ground every few metres it walks, never more at once than its limit', (): void => {
  const world: World = arena(4, ARENA_CONTENT);
  const monster: MonsterState = burning(world);
  stepTrail(world, monster);
  assert.equal(trailAreas(world, monster, wake.skill), 0, 'standing still lays nothing');
  walk(world, monster, wake.every * 2.5);
  assert.equal(trailAreas(world, monster, wake.skill), 2);
  walk(world, monster, wake.every * 20);
  assert.equal(trailAreas(world, monster, wake.skill), wake.limit);
  assert.ok(world.areas.every((area): boolean => area.offence.team === 'monster'));
});

void test('a smouldering monster that has not noticed anyone, or a monster with no trail, leaves nothing', (): void => {
  const world: World = arena(4, ARENA_CONTENT);
  const monster: MonsterState = burning(world);
  monster.aggro = false;
  walk(world, monster, wake.every * 4);
  assert.equal(trailAreas(world, monster, wake.skill), 0);
  const plain: MonsterState = place(world, 'unfinished_taker', { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z + 4 });
  plain.aggro = true;
  walk(world, plain, 10);
  assert.equal(world.areas.length, 0);
});
