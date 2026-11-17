import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, ARENA_CONTENT, arena, place } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import type { PackRankDef } from '../../sim/content/rank-types.ts';
import type { Content } from '../../sim/content/types.ts';
import type { MonsterState, World } from '../../sim/world/types.ts';
import { createRankLook, rankLookOf, rankRimStrength } from './rank-look.ts';

const STEP: number = 1 / 60;

function certain(rank: PackRankDef, id: string): PackRankDef {
  if (rank.chance === null) return rank;
  const sure: number = rank.id === id ? 1 : 0;
  return { ...rank, chance: { base: sure, perLevel: 0, max: sure } };
}

function only(id: string): Content {
  const ranks = ARENA_CONTENT.packRanks;
  const forced: PackRankDef[] = [];
  for (const rank of ranks.ranks) forced.push(certain(rank, id));
  return { ...ARENA_CONTENT, packRanks: { ...ranks, ranks: forced } };
}

function ranked(id: string): { readonly world: World; readonly monster: MonsterState } {
  const world: World = arena(5, only(id));
  world.zone = { ...world.zone, ranks: true };
  return { world, monster: place(world, 'unfinished_brute', ARENA_CENTRE) };
}

void test('a ranked monster carries a rim in its rank colour, eased in and eased out after it falls, and nothing on the ground', (): void => {
  const { world, monster } = ranked('magic');
  const look = must(rankLookOf(monster), 'magic look');
  const view = createRankLook();
  view.update(STEP, world);
  const first: number = must(view.rimOf(monster.id), 'a rim').amount;
  assert.ok(first > 0 && first < look.rim, 'nothing snaps on in one frame');
  for (let frame: number = 0; frame < 240; frame += 1) view.update(STEP, world);
  assert.ok(Math.abs(must(view.rimOf(monster.id), 'a rim').amount - look.rim) < 0.02);
  assert.equal(must(view.rimOf(monster.id), 'rim').color.getHexString(), must(monster.def.rank?.aura, 'aura').slice(1));
  monster.alive = false;
  view.update(STEP, world);
  assert.ok(must(view.rimOf(monster.id), 'still fading').amount > 0);
  for (let frame: number = 0; frame < 600; frame += 1) view.update(STEP, world);
  assert.equal(view.rimOf(monster.id), null);
});

void test('a rare leader has the strongest rim, its followers match their rank, and a plain monster has none', (): void => {
  const placed: MonsterState = ranked('rare').monster;
  const look = must(rankLookOf(placed), 'rare look');
  const rank = must(placed.def.rank, 'rank');
  const rare: MonsterState = { ...placed, def: { ...placed.def, rank: { ...rank, leader: false } } };
  const leader: MonsterState = { ...placed, def: { ...placed.def, rank: { ...rank, leader: true } } };
  assert.ok(rankRimStrength(leader, look) > rankRimStrength(rare, look));
  assert.equal(rankRimStrength(rare, look), look.rim);
  const world: World = arena(5, ARENA_CONTENT);
  const plain: MonsterState = place(world, 'unfinished_brute', ARENA_CENTRE);
  assert.equal(rankLookOf(plain), null);
  const view = createRankLook();
  view.update(STEP, world);
  assert.equal(view.rimOf(plain.id), null);
});
