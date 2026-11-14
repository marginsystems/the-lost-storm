import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CONTENT } from '../../test/arena-support.ts';
import packRanksData from '../../data/pack-ranks.json' with { type: 'json' };
import { packRanks, rankProblems } from './parse-ranks.ts';
import type { PackRankDef, PackRanks } from './rank-types.ts';

const RANKS: PackRanks = packRanks(packRanksData, 'packRanks');

void test('the shipped ranks read cleanly and start with the plain rank', (): void => {
  assert.equal(RANKS.ranks[0]?.chance, null);
  assert.ok(RANKS.ranks.slice(1).every((rank: PackRankDef): boolean => rank.chance !== null));
  assert.deepEqual(rankProblems(ARENA_CONTENT), []);
});

void test('a rank reader refuses a plain rank with a chance, a later rank without one, and a cap below its start', (): void => {
  const [plain, magic] = packRanksData.ranks;
  if (plain === undefined || magic === undefined) throw new Error('the shipped ranks start with plain and magic');
  assert.throws((): PackRanks => packRanks({ ...packRanksData, ranks: [{ ...plain, chance: { base: 0.1, perLevel: 0, max: 0.1 } }] }, 'r'), /plain one/);
  assert.throws((): PackRanks => packRanks({ ...packRanksData, ranks: [plain, { ...magic, chance: null }] }, 'r'), /needs a chance/);
  assert.throws((): PackRanks => packRanks({ ...packRanksData, ranks: [plain, { ...magic, chance: { base: 0.3, perLevel: 0, max: 0.1 } }] }, 'r'), /cap below/);
  assert.throws((): PackRanks => packRanks({ ...packRanksData, ranks: [plain, { ...magic, members: { ...magic.members, mods: 1.5 } }] }, 'r'), /whole number/);
});

void test('rank problems name an unknown floor, an unknown or summoning pool modifier and a pool too small for the rolls', (): void => {
  const broken: PackRanks = {
    ...RANKS,
    ranks: RANKS.ranks.map((rank: PackRankDef): PackRankDef => (rank.leader === null ? rank : { ...rank, leader: { ...rank.leader, floor: 'mythic', mods: 9 } })),
    pool: [...RANKS.pool, { mod: 'nothing', weight: 1 }, { mod: 'gravecalling', weight: 1 }],
  };
  const problems: string[] = rankProblems({ ...ARENA_CONTENT, packRanks: broken });
  assert.ok(problems.some((problem: string): boolean => problem.includes('unknown rarity mythic')));
  assert.ok(problems.some((problem: string): boolean => problem.includes('unknown modifier nothing')));
  assert.ok(problems.some((problem: string): boolean => problem.includes('gravecalling summons')));
  assert.ok(problems.some((problem: string): boolean => problem.includes('rolls 9 modifiers')));
});
