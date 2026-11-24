import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { must } from '../../test/support.ts';
import { LAYOUT, RL } from './contract.ts';
import { GATHER_GOALS } from './gather.ts';
import type { EpisodeSummary, Match, MatchKind, Pool, PoolOptions, PoolStep } from './pool.ts';
import { arenaSeats, createPool, gatherCount, matchCount, matchHeroes, matchKind, stepPool } from './pool.ts';

const CONTENT: Content = loadContent();
const MIXED: PoolOptions = { seed: 17, envs: 5, duels: 1, gathers: 2, jitter: 0, waves: 1, keepEvery: 0, levels: [] };

function still(pool: Pool): PoolStep {
  return stepPool(pool, new Int32Array(pool.options.envs * RL.actionParts));
}

void test('gathers come last, one env each', (): void => {
  assert.equal(gatherCount(MIXED), 2);
  assert.equal(arenaSeats(MIXED), 1);
  assert.equal(matchCount(MIXED), 4);
  assert.deepEqual([0, 1, 2, 3].map((index: number): MatchKind => matchKind(MIXED, index)), ['arena', 'duel', 'gather', 'gather']);
  assert.equal(matchKind({ ...MIXED, envs: 7, roams: 1, escorts: 1, gathers: 1 }, 4), 'gather');
});

void test('a pool plays its gathers beside its arenas and duels', (): void => {
  const pool: Pool = createPool(CONTENT, MIXED);
  assert.deepEqual(pool.matches.map((match: Match): string => match.kind), ['arena', 'duel', 'gather', 'gather']);
  assert.deepEqual(pool.matches.map((match: Match): number => matchHeroes(match).length), [1, 2, 1, 1]);
  const step: PoolStep = still(pool);
  assert.equal(step.obs.length, MIXED.envs * LAYOUT.size);
  assert.equal(step.rewards.length, MIXED.envs);
});

void test('a finished gather reports its goal and what it bumped into, and a new one takes its place', (): void => {
  const pool: Pool = createPool(CONTENT, MIXED);
  const before: Match[] = [...pool.matches];
  const finished: EpisodeSummary[] = [];
  for (let decision: number = 0; decision < 400 && finished.length === 0; decision += 1) finished.push(...still(pool).finished.filter((episode: EpisodeSummary): boolean => episode.situation === 'gather'));
  const episode: EpisodeSummary = must(finished[0], 'a finished gather');
  assert.ok(episode.env === 3 || episode.env === 4);
  assert.ok(GATHER_GOALS.some((goal: string): boolean => goal === episode.goal));
  assert.ok(['won', 'timeout'].includes(episode.outcome));
  for (const count of [episode.contacts, episode.intrusions, episode.crossings, episode.jitters]) assert.ok(count !== undefined && count >= 0);
  const index: number = episode.env - 1;
  assert.notEqual(pool.matches[index], before[index]);
  assert.equal(must(pool.matches[index], 'the next gather').kind, 'gather');
});

void test('a pool refuses more gathers than its envs hold', (): void => {
  assert.throws((): Pool => createPool(CONTENT, { ...MIXED, gathers: 4 }), /need 6 envs/);
});
