import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OUTPOST_CONTENT, OUTPOST_ZONE } from '../../test/road-support.ts';
import { must } from '../../test/support.ts';
import { UNRANKED_CONTENT } from '../../test/unranked-support.ts';
import { distance } from '../math.ts';
import { choicesOpen } from './death.ts';
import { objectiveTarget } from './objective.ts';
import type { ObjectiveTarget } from './objective.ts';
import type { Command, MomentState } from './types.ts';
import type { Content, MonsterDef, ZoneDef, ZonePack } from '../content/types.ts';
import { createWorld } from './create.ts';
import { freshRun, plannedRank, spawnPack, waiting } from './packs.ts';
import { keepLive, parkZone, restoreKept } from './portal-keep.ts';
import { ARENA_CENTRE, ARENA_CONTENT, arena } from '../../test/arena-support.ts';
import type { PackRankDef, PackRanks } from '../content/rank-types.ts';
import { rankChance } from './ranks.ts';
import { spawnPacks } from './monsters.ts';
import type { PackTimer } from './pack-return.ts';
import { levelSpan } from './spawn.ts';
import { stepWorld } from './step.ts';
import type { MonsterState, World } from './types.ts';
import { enterZone } from './zones.ts';

const STEP = { dt: 0.05 } as const;
const SLEEPERS: ZonePack = { x: 12, z: 12, members: [{ monster: 'mended', count: 3, mods: [] }], when: [], level: 12, waits: { near: 8 } };
const CRIER: ZonePack = { x: 44, z: 12, members: [{ monster: 'crier', count: 1, mods: [] }], when: [], level: 7 };
const RULES = { after: 20, away: 10 } as const;
const DEN: ZoneDef = { ...OUTPOST_ZONE, id: 'den', surge: null, packReturn: RULES, packs: [SLEEPERS, CRIER] };

function crierDef(): MonsterDef {
  const base: MonsterDef = must(OUTPOST_CONTENT.monsters.get('mended'), 'mended');
  return { ...base, id: 'crier', alarm: { reach: 40, cry: 3 } };
}

function denWorld(): World {
  const content: Content = {
    ...OUTPOST_CONTENT,
    monsters: new Map<string, MonsterDef>([...OUTPOST_CONTENT.monsters, ['crier', crierDef()]]),
    zones: new Map<string, ZoneDef>([...OUTPOST_CONTENT.zones, [DEN.id, DEN]]),
  };
  const world: World = createWorld(content, { seed: 4, save: null });
  enterZone(world, DEN, { type: 'start' });
  world.player.invulnerable = 1e9;
  world.events = [];
  return world;
}

function packOf(world: World, pack: ZonePack): MonsterState[] {
  const ids: Set<number> = new Set<number>(world.packReturns.filter((timer: PackTimer): boolean => timer.pack === pack).map((timer: PackTimer): number => timer.packId));
  return world.monsters.filter((monster: MonsterState): boolean => monster.alive && ids.has(monster.packId));
}

function run(world: World, seconds: number): void {
  for (let elapsed: number = 0; elapsed < seconds; elapsed += STEP.dt) stepWorld(world, [], STEP.dt);
}

void test('a pack with a level of its own spawns at that level whatever the hero is', (): void => {
  const world: World = denWorld();
  const crier: MonsterState = must(packOf(world, CRIER)[0], 'crier');
  assert.equal(world.player.level, 1);
  assert.equal(crier.level, 7);
  assert.deepEqual(levelSpan(world), { least: 7, most: 12 });
});

void test('a waiting pack is not there until the hero comes near, then it rises already hunting him', (): void => {
  const world: World = denWorld();
  assert.equal(packOf(world, SLEEPERS).length, 0);
  assert.equal(waiting(world, SLEEPERS), true);
  world.player.pos = { x: SLEEPERS.x + 12, z: SLEEPERS.z + 6 };
  run(world, 1);
  assert.equal(packOf(world, SLEEPERS).length, 0);
  world.player.pos = { x: SLEEPERS.x + 6, z: SLEEPERS.z + 2 };
  run(world, STEP.dt);
  const risen: MonsterState[] = packOf(world, SLEEPERS);
  assert.equal(risen.length, 3);
  assert.ok(risen.every((monster: MonsterState): boolean => monster.aggro && monster.spawnTime > 0 && monster.level === 12));
});

void test('a crier that sees the hero runs to the nearest waiting pack and wakes it, far from the hero', (): void => {
  const world: World = denWorld();
  world.player.pos = { x: CRIER.x, z: CRIER.z + 6 };
  const crier: MonsterState = must(packOf(world, CRIER)[0], 'crier');
  let waited: number = 0;
  while (packOf(world, SLEEPERS).length === 0 && waited < 20) {
    run(world, STEP.dt);
    waited += STEP.dt;
  }
  assert.equal(packOf(world, SLEEPERS).length, 3);
  assert.ok(Math.hypot(crier.pos.x - SLEEPERS.x, crier.pos.z - SLEEPERS.z) <= 3.5, `crier at ${crier.pos.x}, ${crier.pos.z}`);
  assert.ok(Math.hypot(world.player.pos.x - SLEEPERS.x, world.player.pos.z - SLEEPERS.z) > 8);
});

void test('a crier cut down before it gets there wakes nobody', (): void => {
  const world: World = denWorld();
  world.player.pos = { x: CRIER.x, z: CRIER.z + 6 };
  run(world, 0.5);
  for (const monster of packOf(world, CRIER)) {
    monster.alive = false;
    monster.life = 0;
  }
  run(world, 20);
  assert.equal(packOf(world, SLEEPERS).length, 0);
  assert.equal(waiting(world, SLEEPERS), true);
});

void test('a woken pack that is cleared comes back asleep, and only wakes again when the hero comes near', (): void => {
  const world: World = denWorld();
  world.player.pos = { x: SLEEPERS.x + 6, z: SLEEPERS.z + 2 };
  run(world, STEP.dt);
  for (const monster of packOf(world, SLEEPERS)) {
    monster.alive = false;
    monster.life = 0;
  }
  world.player.pos = { x: 28, z: 37 };
  run(world, RULES.after + 2);
  assert.equal(packOf(world, SLEEPERS).length, 0);
  assert.equal(waiting(world, SLEEPERS), true);
  world.player.pos = { x: SLEEPERS.x + 6, z: SLEEPERS.z + 2 };
  run(world, STEP.dt);
  assert.equal(packOf(world, SLEEPERS).length, 3);
});

void test('a pack that names its rank always spawns at that rank, a rare one led by its leader, whatever the roll', (): void => {
  const named: ZonePack = { x: 30, z: 30, members: [{ monster: 'mended', count: 4, mods: [] }], when: [], level: 12, rank: 'rare' };
  const hall: ZoneDef = { ...OUTPOST_ZONE, id: 'ranked_hall', ranks: true, surge: null, packReturn: RULES, packs: [named] };
  const content: Content = { ...OUTPOST_CONTENT, zones: new Map<string, ZoneDef>([...OUTPOST_CONTENT.zones, [hall.id, hall]]) };
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const world: World = createWorld(content, { seed, save: null });
    enterZone(world, hall, { type: 'start' });
    const members: MonsterState[] = packOf(world, named);
    assert.equal(members.length, 4);
    assert.ok(members.every((monster: MonsterState): boolean => monster.def.rank?.id === 'rare'), `seed ${seed}`);
    assert.equal(members.filter((monster: MonsterState): boolean => monster.def.rank?.leader === true).length, 1, `seed ${seed}`);
  }
});

const FIRST_WALK = { seeds: 8, limit: 90, dt: 0.05, moveEvery: 5 } as const;

function echoFaction(world: World, monster: MonsterState): boolean {
  return monster.def.faction === world.content.moments.faction;
}

function roamers(world: World): MonsterState[] {
  return world.monsters.filter((monster: MonsterState): boolean => monster.alive && !echoFaction(world, monster));
}

function firstWalkCommands(world: World, tick: number): Command[] {
  const foe: MonsterState | undefined = world.monsters.filter((monster: MonsterState): boolean => monster.alive && monster.aggro && echoFaction(world, monster)).toSorted((a: MonsterState, b: MonsterState): number => distance(a.pos, world.player.pos) - distance(b.pos, world.player.pos))[0];
  if (foe !== undefined) return [{ type: 'skill', slot: 0, aim: foe.pos, targetId: foe.id }];
  if (choicesOpen(world)) return [{ type: 'respawn', choice: 'checkpoint' }];
  const target: ObjectiveTarget | null = objectiveTarget(world);
  return tick % FIRST_WALK.moveEvery === 0 && target !== null ? [{ type: 'move', held: false, dest: target.pos }] : [];
}

void test('a fresh hero walking the arrow from arrival to the first moment, dying there once, never comes within reach of a roaming pack until it is cleared', (): void => {
  const hall: ZoneDef = must(UNRANKED_CONTENT.zones.get('hall_of_time'), 'hall');
  for (let seed: number = 1; seed <= FIRST_WALK.seeds; seed += 1) {
    const world: World = createWorld(UNRANKED_CONTENT, { seed, save: null });
    enterZone(world, hall, { type: 'start' });
    world.player.invulnerable = Infinity;
    assert.ok(roamers(world).length > 0, `seed ${seed}: some packs stand in the Hall from the start`);
    let died: boolean = false;
    let exposed: boolean = false;
    let struck: boolean = false;
    let tick: number = 0;
    for (let elapsed: number = 0; elapsed < FIRST_WALK.limit && world.flags['first_moment'] !== 'cleared'; elapsed += FIRST_WALK.dt) {
      if (!exposed && world.moments.some((moment: MomentState): boolean => moment.phase === 'awake' && moment.entered)) {
        exposed = true;
        world.player.invulnerable = 0;
        world.player.life = 1;
        world.player.stats.lifeRegen = 0;
      }
      died = died || !world.player.alive;
      for (const event of stepWorld(world, firstWalkCommands(world, tick), FIRST_WALK.dt)) {
        if (event.type === 'moment_mark') struck = true;
        if (event.type === 'player_respawn') world.player.invulnerable = Infinity;
        const roused: MonsterState | undefined = event.type === 'aggro' ? world.monsters.find((monster: MonsterState): boolean => monster.id === event.monsterId) : undefined;
        if (roused !== undefined) assert.ok(echoFaction(world, roused), `seed ${seed}: ${roused.def.id} woke at ${elapsed.toFixed(1)} s`);
      }
      tick += 1;
      for (const roamer of roamers(world)) assert.ok(distance(roamer.pos, world.player.pos) > roamer.def.aggroRadius, `seed ${seed}: ${roamer.def.id} at ${roamer.pos.x.toFixed(1)},${roamer.pos.z.toFixed(1)} within reach of the hero at ${elapsed.toFixed(1)} s`);
    }
    assert.ok(struck && died, `seed ${seed}: the first moment struck and he died in it`);
    assert.equal(world.flags['first_moment'], 'cleared', `seed ${seed}`);
  }
});

function rankedPacks(world: World): Map<number, string> {
  const ranks: Map<number, string> = new Map<number, string>();
  for (const monster of world.monsters) ranks.set(monster.packId, monster.def.rank?.id ?? 'normal');
  return ranks;
}

function rowOfPacks(count: number): ZonePack[] {
  return Array.from({ length: count }, (_unused: unknown, index: number): ZonePack => ({ x: ARENA_CENTRE.x - 12 + index * 3, z: ARENA_CENTRE.z + 8, members: [{ monster: 'unfinished_taker', count: 1, mods: [] }], when: [], level: 20 }));
}

function nearlyNever(content: Content): Content {
  const ranks: PackRanks = content.packRanks;
  const faint: PackRankDef[] = ranks.ranks.map((rank: PackRankDef): PackRankDef => (rank.chance === null ? rank : { ...rank, chance: { ...rank.chance, base: 1e-9, perLevel: 0, max: 1e-9 } }));
  return { ...content, packRanks: { ...ranks, ranks: faint } };
}

void test('every stretch of packs in a level holds at least one ranked pack, however the rolls fall', (): void => {
  const content: Content = nearlyNever(ARENA_CONTENT);
  for (const seed of [1, 2, 3]) {
    const world: World = arena(seed, content);
    world.zone = { ...world.zone, ranks: true, packs: rowOfPacks(10) };
    world.spawnedPacks = [];
    world.rankRun = freshRun();
    spawnPacks(world);
    const ids: string[] = [...rankedPacks(world).entries()].toSorted((a: [number, string], b: [number, string]): number => a[0] - b[0]).map((entry: [number, string]): string => entry[1]);
    const size: number = content.packRanks.stretch;
    const whole: number = Math.floor(ids.length / size) * size;
    assert.ok(whole >= size * 2);
    for (let from: number = 0; from < whole; from += size) {
      const stretch: string[] = ids.slice(from, from + size);
      assert.equal(stretch.filter((id: string): boolean => id !== 'normal').length, 1, `stretch at ${from}: ${stretch.join(',')}`);
      assert.equal(stretch.at(-1), 'magic', 'the last pack of a plain stretch is lifted to the lowest rank');
    }
  }
});

void test('a pack held back until the hero comes near does not hold a stretch open: the guarantee counts packs in the order they roll', (): void => {
  const content: Content = nearlyNever(ARENA_CONTENT);
  const world: World = arena(5, content);
  const [first, held, ...rest] = rowOfPacks(9);
  const row: ZonePack[] = [must(first, 'first pack'), { ...must(held, 'held pack'), x: ARENA_CENTRE.x + 200, waits: { near: 0.1 } }, ...rest];
  world.zone = { ...world.zone, ranks: true, packs: row };
  world.spawnedPacks = [];
  world.rankRun = freshRun();
  spawnPacks(world);
  const ids: string[] = [...rankedPacks(world).entries()].toSorted((a: [number, string], b: [number, string]): number => a[0] - b[0]).map((entry: [number, string]): string => entry[1]);
  assert.equal(ids.length, 8);
  assert.deepEqual(ids, ['normal', 'normal', 'normal', 'magic', 'normal', 'normal', 'normal', 'magic']);
  assert.equal(world.rankRun.rolled, 0);
});

void test('a named rank, a pack with an authored modifier and a zone without ranks never count toward or take the guarantee', (): void => {
  const content: Content = nearlyNever(ARENA_CONTENT);
  const world: World = arena(4, content);
  world.zone = { ...world.zone, ranks: true, packs: [] };
  world.rankRun = freshRun();
  for (const pack of rowOfPacks(6)) spawnPack(world, { ...pack, rank: 'normal' }, 0, false);
  for (const pack of rowOfPacks(6)) spawnPack(world, { ...pack, members: [{ monster: 'unfinished_taker', count: 1, mods: ['swift'] }] }, 0, false);
  assert.equal(world.rankRun.rolled, 0);
  assert.ok(world.monsters.every((monster: MonsterState): boolean => monster.def.rank === null));
  const plain: World = arena(4, content);
  plain.zone = { ...plain.zone, ranks: false, packs: rowOfPacks(8) };
  plain.spawnedPacks = [];
  plain.rankRun = freshRun();
  spawnPacks(plain);
  assert.equal(plain.rankRun.rolled, 0);
  assert.ok(plain.monsters.every((monster: MonsterState): boolean => monster.def.rank === null));
});

void test('the open stretch closes after the set number of rolls and lifts only a plain last roll', (): void => {
  const world: World = arena(6, nearlyNever(ARENA_CONTENT));
  world.rankRun = freshRun();
  const size: number = world.content.packRanks.stretch;
  const rolls: (string | null)[] = Array.from({ length: size * 2 }, (): string | null => plannedRank(world, 20)?.id ?? null);
  const ranked: number[] = rolls.flatMap((id: string | null, index: number): number[] => (id === 'magic' ? [index] : []));
  assert.deepEqual(ranked, [size - 1, size * 2 - 1]);
  world.rankRun = { rolled: 1, ranked: true };
  const after: (string | null)[] = Array.from({ length: size - 1 }, (): string | null => plannedRank(world, 20)?.id ?? null);
  assert.ok(after.every((id: string | null): boolean => id !== 'magic'), 'a stretch that already met a ranked pack is not lifted again');
});

void test('a portal kept live carries the open stretch back with the rest of the level', (): void => {
  const world: World = arena(7, ARENA_CONTENT);
  world.portal = { zone: world.zone.id, pos: { x: 0, z: 0 }, respawn: { type: 'start' }, reach: 1, kept: null };
  world.rankRun = { rolled: 2, ranked: true };
  assert.deepEqual(keepLive(world).rankRun, { rolled: 2, ranked: true });
  parkZone(world);
  world.rankRun = freshRun();
  assert.equal(restoreKept(world), true);
  assert.deepEqual(world.rankRun, { rolled: 2, ranked: true });
});

void test('the first cave level meets magic packs only; from the second on about one pack in three is magic and one in eight rare', (): void => {
  const content: Content = ARENA_CONTENT;
  const rare: PackRankDef = must(content.packRanks.ranks.find((rank: PackRankDef): boolean => rank.id === 'rare'), 'rare');
  const magic: PackRankDef = must(content.packRanks.ranks.find((rank: PackRankDef): boolean => rank.id === 'magic'), 'magic');
  const first: ZoneDef = must(content.zones.get('under_hall'), 'first cave level');
  for (const pack of first.packs) assert.equal(rankChance(must(rare.chance, 'rare chance'), pack.level ?? first.level), 0);
  for (const id of ['under_hall_2', 'under_hall_3', 'lava_depths', 'ledger_hall', 'ledger_hall_3']) {
    const zone: ZoneDef = must(content.zones.get(id), id);
    const rolled: ZonePack[] = zone.packs.filter((pack: ZonePack): boolean => pack.rank === undefined && pack.members.every((member): boolean => member.mods.length === 0));
    assert.ok(rolled.length > zone.packs.length / 2, `${id} rolls most of its packs`);
    for (const pack of rolled) {
      const level: number = pack.level ?? zone.level;
      const rareShare: number = rankChance(must(rare.chance, 'rare chance'), level);
      const magicShare: number = (1 - rareShare) * rankChance(must(magic.chance, 'magic chance'), level);
      assert.ok(rareShare >= 0.11 && rareShare <= 0.17, `${id} level ${level} rare ${rareShare}`);
      assert.ok(magicShare >= 0.27 && magicShare <= 0.36, `${id} level ${level} magic ${magicShare}`);
    }
  }
});
