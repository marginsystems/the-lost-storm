import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { MonsterState, World } from '../../sim/world/types.ts';
import { barKindOf, barWanted, holdingPieces, lookOf } from './health-bars.ts';

void test('a clock holding the Timekeeper wears a bigger, brighter bar than any plain monster, shown even before it is struck', (): void => {
  const world: World = worldIn(loadContent(), 'ledger_court', 1);
  const pieces: Set<number> = holdingPieces(world);
  const held: MonsterState[] = world.monsters.filter((monster: MonsterState): boolean => monster.def.id === 'count_clock_a');
  const later: MonsterState = must(world.monsters.find((monster: MonsterState): boolean => monster.def.id === 'count_clock_b'), 'a later clock');
  const keeper: MonsterState = must(world.monsters.find((monster: MonsterState): boolean => monster.def.boss !== null), 'the Timekeeper');
  assert.equal(held.length, 2);
  for (const clock of held) {
    assert.equal(barKindOf(clock, pieces), 'piece');
    assert.equal(barWanted(clock, 'piece'), true);
  }
  assert.equal(barKindOf(later, pieces), 'plain');
  assert.equal(barWanted(later, 'plain'), false);
  assert.equal(barKindOf(keeper, pieces), 'boss');
  assert.ok(lookOf('piece').width > lookOf('boss').width && lookOf('piece').height > lookOf('boss').height);
  const first: MonsterState = must(held[0], 'a held clock');
  first.alive = false;
  assert.equal(holdingPieces(world).has(first.id), false);
  assert.equal(barWanted(first, 'piece'), false);
});
