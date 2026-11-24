import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { RL } from './contract.ts';
import type { EpisodeSummary, Pool, PoolStep } from './pool.ts';
import { createPool, stepPool } from './pool.ts';

const CONTENT: Content = loadContent();
const SEATS = { envs: 2, duels: 1, limit: 3000 } as const;

function duelOf(pool: Pool): { readonly corner: unknown } {
  const match = pool.matches[0];
  assert.ok(match?.kind === 'duel');
  return match.duel;
}

void test('a pool with a corner share of one starts every duel in a corner and says which seat was cornered when it ends', (): void => {
  const pool: Pool = createPool(CONTENT, { seed: 81, envs: SEATS.envs, duels: SEATS.duels, jitter: 0, waves: 1, keepEvery: 0, levels: [], corners: 1 });
  assert.notEqual(duelOf(pool).corner, null);
  const idle: Int32Array = new Int32Array(SEATS.envs * RL.actionParts);
  let ended: EpisodeSummary[] = [];
  for (let count: number = 0; count < SEATS.limit && ended.length === 0; count += 1) {
    const step: PoolStep = stepPool(pool, idle);
    ended = step.finished.filter((episode: EpisodeSummary): boolean => episode.situation === 'duel');
  }
  assert.deepEqual(ended.map((episode: EpisodeSummary): string | undefined => episode.corner), ['caster', 'cornered']);
});

void test('a pool with no corner share starts no duel in a corner', (): void => {
  const pool: Pool = createPool(CONTENT, { seed: 81, envs: SEATS.envs, duels: SEATS.duels, jitter: 0, waves: 1, keepEvery: 0, levels: [] });
  assert.equal(duelOf(pool).corner, null);
});
