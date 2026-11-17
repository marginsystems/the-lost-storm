import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CONTENT } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import packRanksData from '../../data/pack-ranks.json' with { type: 'json' };
import { packRanks, rankProblems } from './parse-ranks.ts';
import type { PackRankDef, PackRanks, RankModChoice } from './rank-types.ts';
import type { Content, PackMember, ZoneDef } from './types.ts';

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

void test('rank problems name an unknown floor, an unknown or summoning pool modifier, a pool too small for the rolls and an unknown pair kept apart', (): void => {
  const broken: PackRanks = {
    ...RANKS,
    ranks: RANKS.ranks.map((rank: PackRankDef): PackRankDef => (rank.leader === null ? rank : { ...rank, leader: { ...rank.leader, floor: 'mythic', mods: 9 } })),
    pool: [...RANKS.pool, { mod: 'nothing', weight: 1, leader: false, from: 1 }, { mod: 'gravecalling', weight: 1, leader: true, from: 1 }],
    apart: [...RANKS.apart, ['swift', 'nowhere']],
  };
  const problems: string[] = rankProblems({ ...ARENA_CONTENT, packRanks: broken });
  assert.ok(problems.some((problem: string): boolean => problem.includes('unknown rarity mythic')));
  assert.ok(problems.some((problem: string): boolean => problem.includes('unknown modifier nothing')));
  assert.ok(problems.some((problem: string): boolean => problem.includes('gravecalling summons')));
  assert.ok(problems.some((problem: string): boolean => problem.includes('modifiers of its own')));
  assert.ok(problems.some((problem: string): boolean => problem.includes('name nowhere')));
  const calling: PackRanks = { ...RANKS, pool: RANKS.pool.map((entry: RankModChoice): RankModChoice => (entry.mod === 'kincalling' ? { ...entry, leader: false } : entry)) };
  assert.ok(rankProblems({ ...ARENA_CONTENT, packRanks: calling }).some((problem: string): boolean => problem.includes('kincalling summons')));
});

void test('a pair kept apart is two different modifier ids', (): void => {
  assert.throws((): PackRanks => packRanks({ ...packRanksData, apart: [['swift', 'swift']] }, 'r'), /two different/);
  assert.throws((): PackRanks => packRanks({ ...packRanksData, apart: [['swift']] }, 'r'), /pair/);
});

function namedRank(ranks: boolean, rank: string, members: readonly PackMember[]): Content {
  const zone: ZoneDef = { ...must([...ARENA_CONTENT.zones.values()][0], 'a zone'), id: 'ranked_test', ranks, packs: [{ x: 4, z: 6, members, when: [], rank }] };
  return { ...ARENA_CONTENT, zones: new Map<string, ZoneDef>([...ARENA_CONTENT.zones, [zone.id, zone]]) };
}

function named(content: Content, text: string): boolean {
  return rankProblems(content).some((problem: string): boolean => problem.startsWith('zone ranked_test pack at 4,6 ') && problem.includes(text));
}

void test('a pack names a known rank only in a ranked zone and never on a boss, a ranked monster or a modded member', (): void => {
  const mended: readonly PackMember[] = [{ monster: 'mended', count: 2, mods: [] }];
  assert.deepEqual(rankProblems(namedRank(true, 'rare', mended)), []);
  assert.ok(named(namedRank(true, 'mythic', mended), 'names unknown rank mythic'));
  assert.ok(named(namedRank(false, 'rare', mended), 'names rank rare, but the zone has no ranks'));
  assert.ok(named(namedRank(true, 'magic', [{ monster: 'unfinished_colossus', count: 1, mods: [] }]), 'never takes a rank'));
  assert.ok(named(namedRank(true, 'magic', [{ monster: 'mended', count: 2, mods: ['swift'] }]), 'never takes a rank'));
});

void test('a ranked look reads its body and ground light as shares and needs an aura colour to light it', (): void => {
  const [plain, magic] = packRanksData.ranks;
  if (plain === undefined || magic === undefined) throw new Error('the shipped ranks start with plain and magic');
  assert.throws((): PackRanks => packRanks({ ...packRanksData, ranks: [plain, { ...magic, look: { body: 1.5, ground: 0.5, reach: 2 } }] }, 'r'), /0 to 1/);
  assert.throws((): PackRanks => packRanks({ ...packRanksData, ranks: [plain, { ...magic, members: { ...magic.members, size: 0 } }] }, 'r'), /size/);
  const unlit: PackRanks = { ...RANKS, ranks: RANKS.ranks.map((rank: PackRankDef): PackRankDef => (rank.look === null ? rank : { ...rank, aura: null })) };
  assert.ok(rankProblems({ ...ARENA_CONTENT, packRanks: unlit }).some((problem: string): boolean => problem.includes('no aura colour')));
  for (const rank of RANKS.ranks.slice(1)) assert.notEqual(rank.look, null, `${rank.id} is lit`);
});

void test('a rank chance may start at a level, and the stretch is a whole number of packs', (): void => {
  const [plain, magic] = packRanksData.ranks;
  if (plain === undefined || magic === undefined) throw new Error('the shipped ranks start with plain and magic');
  assert.throws((): PackRanks => packRanks({ ...packRanksData, ranks: [plain, { ...magic, chance: { base: 0.1, perLevel: 0, max: 0.1, from: 2.5 } }] }, 'r'), /whole number/);
  assert.throws((): PackRanks => packRanks({ ...packRanksData, stretch: 1.5 }, 'r'), /whole number/);
  assert.ok(RANKS.stretch >= 1);
});
