import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { PlayerState } from '../world/types.ts';
import type { Build } from './build.ts';
import { BUILD } from './build.ts';
import type { Match, Pool, PoolOptions } from './pool.ts';
import { createPool, duelBuilds, matchWorld } from './pool.ts';

const CONTENT: Content = loadContent();

const SPIN: Build = { name: 'Spin', weapon: 'warden_broadsword', skills: ['thunderhead'], route: ['blade_thunderhead', 'heavy_hands', 'blade_1'], hero: null };
const WALL: Build = { name: 'Wall', weapon: 'iron_maul', skills: ['thunderclap'], route: ['stone_thunderclap', 'tempered_body', 'stone_1'], hero: null };
const BASE: PoolOptions = { seed: 21, envs: 3, duels: 1, jitter: 0, waves: 1, keepEvery: 0, levels: [] };

void test('without builds a duel has no builds, as before', (): void => {
  assert.equal(duelBuilds(BASE, 5), undefined);
});

void test('a learner build sits in the first seat against the rivals in turn, or a bench hero when there are none', (): void => {
  const rivals: readonly Build[] = [WALL, SPIN];
  assert.deepEqual(duelBuilds({ ...BASE, build: SPIN, rivals }, 4), [SPIN, WALL]);
  assert.deepEqual(duelBuilds({ ...BASE, build: SPIN, rivals }, 5), [SPIN, SPIN]);
  assert.deepEqual(duelBuilds({ ...BASE, build: SPIN }, 5), [SPIN, null]);
});

void test('fixed seat builds win over the learner build', (): void => {
  assert.deepEqual(duelBuilds({ ...BASE, build: SPIN, seats: [WALL, SPIN] }, 5), [WALL, SPIN]);
  assert.deepEqual(duelBuilds({ ...BASE, seats: [null, WALL] }, 5), [null, WALL]);
  assert.deepEqual(duelBuilds({ ...BASE, build: SPIN, seats: [null, null] }, 5), [null, null]);
});

void test('a pool with a learner build plays it in every arena and in the first duel seat', (): void => {
  const pool: Pool = createPool(CONTENT, { ...BASE, build: SPIN, rivals: [WALL] });
  for (const match of pool.matches) {
    const hero: PlayerState = matchWorld(match).player;
    assert.deepEqual(hero.allocated, SPIN.route);
    assert.equal(hero.level, BUILD.level);
  }
  const duel: Match | undefined = pool.matches.find((match: Match): boolean => match.kind === 'duel');
  assert.equal(duel?.kind === 'duel' ? duel.duel.seats[1]?.hero.equipped.weapon?.base : null, 'groundbreaker');
});
