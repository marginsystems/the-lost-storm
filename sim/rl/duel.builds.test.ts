import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { must } from '../../test/support.ts';
import type { PlayerState } from '../world/types.ts';
import type { Build } from './build.ts';
import { BUILD } from './build.ts';
import type { Duel, DuelSeat } from './duel.ts';
import { createDuel } from './duel.ts';
import type { DuelReplay } from './duel-replay.ts';
import { readDuelReplay, recordDuelReplay, replayDuel } from './duel-replay.ts';

const CONTENT: Content = loadContent();

const SPIN: Build = { name: 'Spin', weapon: 'warden_broadsword', skills: ['thunderhead'], route: ['blade_thunderhead', 'heavy_hands', 'blade_1'], hero: null };
const WALL: Build = { name: 'Wall', weapon: 'iron_maul', skills: ['thunderclap'], route: ['stone_thunderclap', 'tempered_body', 'stone_1'], hero: 'woman' };

function hero(duel: Duel, index: number): PlayerState {
  return must(duel.seats[index], `seat ${index}`).hero;
}

void test('each duel seat plays its own build at the duel level', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: 11, jitter: 0, builds: [SPIN, WALL] });
  assert.equal(duel.level, BUILD.level);
  assert.deepEqual(hero(duel, 0).allocated, SPIN.route);
  assert.deepEqual(hero(duel, 1).allocated, WALL.route);
  assert.equal(hero(duel, 0).equipped.weapon?.base, 'warden_broadsword');
  assert.equal(hero(duel, 1).equipped.weapon?.base, 'iron_maul');
  assert.equal(hero(duel, 1).bar[1], 'thunderclap');
  assert.equal(hero(duel, 1).level, BUILD.level);
});

void test('swapping the builds swaps the heroes and nothing else about them', (): void => {
  const one: Duel = createDuel(CONTENT, { seed: 12, jitter: 0, builds: [SPIN, WALL] });
  const two: Duel = createDuel(CONTENT, { seed: 12, jitter: 0, builds: [WALL, SPIN] });
  assert.deepEqual(hero(one, 0).stats, hero(two, 1).stats);
  assert.deepEqual(hero(one, 1).stats, hero(two, 0).stats);
  assert.deepEqual(hero(one, 0).pos, hero(two, 0).pos);
  assert.deepEqual(hero(one, 1).pos, hero(two, 1).pos);
});

void test('a seat with no build is a random bench hero at the duel level', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: 13, jitter: 0, builds: [SPIN, null] });
  assert.deepEqual(hero(duel, 0).allocated, SPIN.route);
  assert.equal(hero(duel, 1).level, BUILD.level);
});

void test('a duel replay keeps the builds and plays the same heroes again', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: 14, jitter: 0.2, builds: [SPIN, WALL] });
  const record: DuelReplay = readDuelReplay(JSON.parse(JSON.stringify(recordDuelReplay(duel, [[], []], 'test'))));
  const again: Duel = replayDuel(CONTENT, record);
  again.seats.forEach((seat: DuelSeat, index: number): void => {
    assert.deepEqual(seat.hero.allocated, hero(duel, index).allocated);
    assert.deepEqual(seat.hero.stats, hero(duel, index).stats);
  });
});
