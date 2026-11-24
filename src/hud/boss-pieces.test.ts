import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { MonsterState, World } from '../../sim/world/types.ts';
import { piecesCaption, readPieces } from './boss-pieces.ts';
import type { PieceReading } from './boss-pieces.ts';

void test('under the boss bar each clock holding the Timekeeper reads its own share of life, and a broken one reads empty', (): void => {
  const world: World = worldIn(loadContent(), 'ledger_court', 1);
  const keeper: MonsterState = must(world.monsters.find((monster: MonsterState): boolean => monster.def.boss !== null), 'the Timekeeper');
  const clocks: MonsterState[] = world.monsters.filter((monster: MonsterState): boolean => monster.def.id === 'count_clock_a');
  const first: MonsterState = must(clocks[0], 'first clock');
  const second: MonsterState = must(clocks[1], 'second clock');
  first.life = first.maxLife / 2;
  second.alive = false;
  second.life = 0;
  const readings: PieceReading[] = readPieces(world, keeper);
  assert.deepEqual(readings.map((reading: PieceReading): number => reading.id), [first.id, second.id]);
  const [standing, broken] = readings.map((reading: PieceReading): readonly [number, boolean] => [reading.ratio, reading.standing]);
  assert.deepEqual(standing, [0.5, true]);
  assert.deepEqual(broken, [0, false]);
  assert.equal(piecesCaption(readings), 'Standing Clock · 1 left');
  assert.deepEqual(readPieces(world, null), []);
});
