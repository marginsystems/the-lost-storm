import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, ARENA_CONTENT, arena, place } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import type { MonsterModDef } from '../content/combat-types.ts';
import type { MonsterRank, PackRankDef, PackRanks, RankChance, RankScale } from '../content/rank-types.ts';
import type { Content, MonsterDef, RarityDef } from '../content/types.ts';
import { createRng } from '../rng.ts';
import type { Rng } from '../rng.ts';
import { kill } from './combat.ts';
import { keptApart, modAvailable, rankChance, rankPack, rankSize, ranksHere, rollMods, rollRank } from './ranks.ts';
import { bodySized } from './skills.ts';
import type { GroundItem, MonsterState, World } from './types.ts';

const ranks: PackRanks = ARENA_CONTENT.packRanks;
const magic: PackRankDef = must(ranks.ranks.find((rank: PackRankDef): boolean => rank.id === 'magic'), 'magic rank');
const rare: PackRankDef = must(ranks.ranks.find((rank: PackRankDef): boolean => rank.id === 'rare'), 'rare rank');
const brute: MonsterDef = must(ARENA_CONTENT.monsters.get('unfinished_brute'), 'brute');
const taker: MonsterDef = must(ARENA_CONTENT.monsters.get('unfinished_taker'), 'taker');
const boss: MonsterDef = must(ARENA_CONTENT.monsters.get('unfinished_colossus'), 'colossus');

function rarityRank(content: Content, id: string): number {
  return content.rarities.findIndex((rarity: RarityDef): boolean => rarity.id === id);
}

function only(rank: PackRankDef): Content {
  return { ...ARENA_CONTENT, packRanks: { ...ranks, ranks: ranks.ranks.map((each: PackRankDef): PackRankDef => (each.chance === null ? each : { ...each, chance: { base: each.id === rank.id ? 1 : 0, perLevel: 0, max: each.id === rank.id ? 1 : 0, from: 1 } })) } };
}

void test('a ranked chance grows with the level and stops at its cap', (): void => {
  const chance: RankChance = must(rare.chance, 'rare chance');
  assert.equal(rankChance(chance, 1), chance.base);
  assert.ok(rankChance(chance, 10) > rankChance(chance, 5));
  assert.equal(rankChance(chance, 1000), chance.max);
});

void test('the rank roll is the same for the same seed, and over many packs lands near the chances in the data', (): void => {
  const first: Rng = createRng(42);
  const second: Rng = createRng(42);
  for (let pack: number = 0; pack < 50; pack += 1) assert.equal(rollRank(ranks, first, 10)?.id, rollRank(ranks, second, 10)?.id);
  const counts: Map<string, number> = new Map<string, number>();
  const rng: Rng = createRng(7);
  const packs: number = 20000;
  for (let pack: number = 0; pack < packs; pack += 1) {
    const id: string = rollRank(ranks, rng, 10)?.id ?? 'none';
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const rareShare: number = rankChance(must(rare.chance, 'rare chance'), 10);
  const magicShare: number = (1 - rareShare) * rankChance(must(magic.chance, 'magic chance'), 10);
  assert.ok(Math.abs((counts.get('rare') ?? 0) / packs - rareShare) < 0.01);
  assert.ok(Math.abs((counts.get('magic') ?? 0) / packs - magicShare) < 0.015);
  assert.equal(counts.get('none'), undefined);
});

void test('a magic pack shares two modifiers and is tougher, deadlier and worth more, and keeps its own name', (): void => {
  const [one, two] = rankPack(ARENA_CONTENT, createRng(3), magic, [taker, taker], 20);
  const left: MonsterDef = must(one, 'first member');
  const right: MonsterDef = must(two, 'second member');
  assert.equal(left.mods.length, magic.members.mods);
  assert.equal(magic.members.mods, 2);
  assert.deepEqual(left.mods, right.mods);
  const mods: MonsterModDef[] = left.mods.map((id: string): MonsterModDef => must(ARENA_CONTENT.monsterMods.get(id), id));
  const times = (pick: (mod: MonsterModDef) => number): number => mods.reduce((product: number, mod: MonsterModDef): number => product * pick(mod), 1);
  assert.ok(Math.abs(left.life - taker.life * times((mod: MonsterModDef): number => mod.lifeScale) * magic.members.life) < 1e-9);
  assert.ok(Math.abs(left.damageMax - taker.damageMax * times((mod: MonsterModDef): number => mod.damageScale) * magic.members.damage) < 1e-9);
  assert.ok(Math.abs(left.xp - taker.xp * times((mod: MonsterModDef): number => mod.xpScale) * magic.members.xp) < 1e-9);
  assert.ok(Math.abs(left.loot.itemChance - Math.min(1, taker.loot.itemChance * times((mod: MonsterModDef): number => mod.lootScale) * magic.members.itemChance)) < 1e-9);
  const rank: MonsterRank = must(left.rank, 'magic rank');
  assert.equal(rank.id, 'magic');
  assert.equal(rank.leader, false);
  assert.equal(left.color, taker.color, 'a rank never repaints the monster');
  assert.equal(left.name, taker.name);
});

void test('a rare pack has one named leader with the most modifiers, and its followers share all but the leader\'s own', (): void => {
  const pack: MonsterDef[] = rankPack(ARENA_CONTENT, createRng(11), rare, [taker, brute, taker], 20);
  const leader: MonsterDef = must(pack[1], 'the brute leads');
  const lead: RankScale = must(rare.leader, 'rare leader scale');
  const rank: MonsterRank = must(leader.rank, 'leader rank');
  assert.equal(rank.leader, true);
  assert.equal(leader.mods.length, lead.mods);
  assert.equal(new Set<string>(leader.mods).size, lead.mods);
  assert.ok(rank.title !== null && leader.name === rank.title);
  assert.equal(rank.items, lead.items);
  assert.equal(rank.floor, lead.floor);
  for (const follower of [pack[0], pack[2]]) {
    const def: MonsterDef = must(follower, 'follower');
    assert.equal(def.rank?.leader, false);
    assert.deepEqual(def.mods, leader.mods.slice(0, rare.members.mods));
  }
  assert.deepEqual(
    rankPack(ARENA_CONTENT, createRng(11), rare, [taker, brute, taker], 20).map((def: MonsterDef): string => def.name),
    pack.map((def: MonsterDef): string => def.name),
  );
});

void test('a plain pack, a boss, an authored elite and a pack that is already ranked are left as they are', (): void => {
  const plain: PackRankDef = must(ranks.ranks[0], 'plain rank');
  assert.deepEqual(rankPack(ARENA_CONTENT, createRng(1), plain, [taker, brute], 20), [taker, brute]);
  assert.equal(ranksHere([taker, boss]), false);
  assert.equal(ranksHere([taker, { ...brute, mods: ['swift'] }]), false);
  assert.equal(ranksHere(rankPack(ARENA_CONTENT, createRng(1), magic, [taker], 20)), false);
  assert.equal(ranksHere([taker, brute]), true);
});

void test('packs in a zone with ranks roll them when they spawn, and a zone without ranks never does', (): void => {
  const ranked: World = arena(5, only(rare));
  ranked.zone = { ...ranked.zone, ranks: true };
  const rank: MonsterRank = must(place(ranked, 'unfinished_brute', ARENA_CENTRE).def.rank, 'spawned rank');
  assert.equal(rank.id, 'rare');
  assert.equal(rank.leader, true);
  const plain: World = arena(5, only(rare));
  assert.equal(place(plain, 'unfinished_brute', ARENA_CENTRE).def.rank, null);
});

void test('a rare leader drops its guaranteed items, none of them below its floor', (): void => {
  const lead: RankScale = must(rare.leader, 'rare leader scale');
  const floor: string = must(lead.floor, 'leader floor');
  for (let seed: number = 1; seed <= 12; seed += 1) {
    const content: Content = only(rare);
    const world: World = arena(seed, { ...content, monsters: new Map<string, MonsterDef>([...content.monsters, ['unfinished_brute', { ...brute, loot: { ...brute.loot, itemChance: 0 } }]]) });
    world.zone = { ...world.zone, ranks: true };
    const leader: MonsterState = place(world, 'unfinished_brute', ARENA_CENTRE);
    kill(world, leader, { x: 0, z: 1 });
    const items: GroundItem[] = world.ground.filter((ground: GroundItem): boolean => ground.content.kind === 'item');
    assert.equal(items.length, lead.items);
    for (const ground of items) {
      if (ground.content.kind !== 'item') continue;
      assert.ok(rarityRank(world.content, ground.content.item.rarity) >= rarityRank(world.content, floor), `seed ${seed} dropped ${ground.content.item.rarity}`);
    }
  }
});

void test('a ranked monster is bigger by its rank, a rare leader biggest, and its melee arc reaches as far as its body grew', (): void => {
  const [magicOne] = rankPack(ARENA_CONTENT, createRng(3), magic, [taker], 20);
  const pack: MonsterDef[] = rankPack(ARENA_CONTENT, createRng(11), rare, [taker, brute], 20);
  assert.ok(Math.abs(sized(magicOne, taker) - magic.members.size) < 1e-9);
  assert.ok(Math.abs(sized(pack[0], taker) - rare.members.size) < 1e-9);
  assert.ok(Math.abs(sized(pack[1], brute) - must(rare.leader, 'rare leader').size) < 1e-9);
  assert.ok(magic.members.size > 1 && rare.members.size > magic.members.size && must(rare.leader, 'rare leader').size > rare.members.size);
  assert.equal(rankSize(taker), 1);
  const world: World = arena(5, only(rare));
  world.zone = { ...world.zone, ranks: true };
  const leader: MonsterState = place(world, 'unfinished_brute', ARENA_CENTRE);
  const swing = must(ARENA_CONTENT.skills.get(leader.def.skill), 'brute skill');
  const grown = bodySized(leader, swing);
  if (swing.delivery.type === 'arc' && grown.delivery.type === 'arc') assert.ok(Math.abs(grown.delivery.reach - swing.delivery.reach * rankSize(leader.def)) < 1e-9);
  else assert.equal(grown, swing);
  assert.equal(bodySized(world.player, swing), swing);
});

function withModsSize(def: MonsterDef): number {
  return def.mods.reduce((size: number, id: string): number => size * must(ARENA_CONTENT.monsterMods.get(id), id).sizeScale, 1);
}

function sized(def: MonsterDef | undefined, base: MonsterDef): number {
  return must(def, 'ranked').scale / (base.scale * withModsSize(must(def, 'ranked')));
}

void test('over many packs no pack ever carries two modifiers kept apart, and only a rare leader calls its kind', (): void => {
  const rng: Rng = createRng(19);
  const apart = ARENA_CONTENT.packRanks.apart;
  assert.ok(apart.length > 0);
  for (let roll: number = 0; roll < 400; roll += 1) {
    const pack: MonsterDef[] = rankPack(ARENA_CONTENT, rng, roll % 2 === 0 ? magic : rare, [taker, brute, taker], 20);
    for (const def of pack) {
      for (const one of def.mods) for (const other of def.mods) assert.ok(one === other || !keptApart(apart, one, other), `${one} and ${other} together`);
      const calls: boolean = def.mods.includes('kincalling');
      assert.equal(calls, def.rank?.leader === true && def.rank.id === 'rare');
    }
  }
});

void test('a modifier roll skips what is held and what is kept apart from it, and stops when nothing fits', (): void => {
  const swift: MonsterModDef = must(ARENA_CONTENT.monsterMods.get('swift'), 'swift');
  for (let seed: number = 1; seed <= 40; seed += 1) {
    const rolled: MonsterModDef[] = rollMods(ARENA_CONTENT, createRng(seed), 3, false, [swift], 20);
    assert.equal(rolled.length, 3);
    for (const mod of rolled) assert.ok(mod.id !== 'swift' && !keptApart(ARENA_CONTENT.packRanks.apart, 'swift', mod.id));
  }
  assert.equal(rollMods(ARENA_CONTENT, createRng(2), 5, true, [], 20).length, 1);
});

void test('a pack with more modifiers is worth more: experience and item chance grow with every modifier', (): void => {
  for (const id of ARENA_CONTENT.packRanks.pool.map((entry) => entry.mod)) {
    const mod: MonsterModDef = must(ARENA_CONTENT.monsterMods.get(id), id);
    assert.ok(mod.xpScale > 1 && mod.lootScale > 1, `${id} pays more`);
  }
  const [magicOne] = rankPack(ARENA_CONTENT, createRng(5), magic, [taker], 20);
  const [rareOne] = rankPack(ARENA_CONTENT, createRng(5), rare, [taker, taker], 20);
  assert.ok(must(magicOne, 'magic').xp > taker.xp * magic.members.xp);
  assert.ok(must(rareOne, 'rare').loot.itemChance > taker.loot.itemChance * rare.members.itemChance);
});

void test('before a modifier is due, no pack carries it: the early levels draw only from the milder modifiers', (): void => {
  const late: Set<string> = new Set<string>(ARENA_CONTENT.packRanks.pool.filter((entry) => entry.from > 9).map((entry) => entry.mod));
  assert.ok(late.has('brutal') && late.has('kincalling'));
  for (let seed: number = 1; seed <= 60; seed += 1) {
    for (const def of rankPack(ARENA_CONTENT, createRng(seed), seed % 2 === 0 ? magic : rare, [taker, brute, taker], 9)) {
      for (const mod of def.mods) assert.ok(!late.has(mod), `seed ${seed}: ${mod} at level 9`);
    }
  }
  assert.equal(modAvailable({ mod: 'brutal', weight: 1, leader: false, from: 14 }, false, 13), false);
  assert.equal(modAvailable({ mod: 'brutal', weight: 1, leader: false, from: 14 }, false, 14), true);
  assert.equal(modAvailable({ mod: 'kincalling', weight: 1, leader: true, from: 1 }, false, 20), false);
});
