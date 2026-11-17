import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, ARENA_CONTENT, arena, place } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import type { MonsterRank } from '../content/rank-types.ts';
import type { TailwindDef, TailwindTier } from '../content/tailwind-types.ts';
import type { Content, MonsterDef } from '../content/types.ts';
import { kill } from './combat.ts';
import { calmTailwind, endTailwind, feedTailwind, killWeight, stepTailwind, tailwindPace, tailwindShares, tierAt } from './tailwind.ts';
import type { MonsterState, World, WorldEvent } from './types.ts';
import { enterZone } from './zones.ts';

const RULES: TailwindDef = {
  name: 'Test wind',
  fuse: 4,
  weights: { plain: 1, ranks: { normal: 1, magic: 2, rare: 2 }, leader: 6, boss: 6 },
  burst: { window: 0.4, seconds: 1, most: 1.5 },
  idle: { drain: 2, reach: 10 },
  fight: { drain: 0.5, reach: 6 },
  tiers: [
    { id: 'one', name: 'One', at: 3, fuse: 4, xp: 0.1, loot: 0.2, speed: 0, windfallXp: 0, windfallGold: 0 },
    { id: 'two', name: 'Two', at: 6, fuse: 5, xp: 0.2, loot: 0.3, speed: 0.02, windfallXp: 0.1, windfallGold: 0.15 },
    { id: 'three', name: 'Three', at: 12, fuse: 6, xp: 0.3, loot: 0.4, speed: 0.05, windfallXp: 0.2, windfallGold: 0.25 },
  ],
};

const CONTENT: Content = { ...ARENA_CONTENT, tailwind: RULES };
const FAR = { x: ARENA_CENTRE.x - 12, z: ARENA_CENTRE.z - 12 } as const;
const SOUTH = { x: 0, z: 1 } as const;

function fresh(seed: number = 3): World {
  const world: World = arena(seed, CONTENT);
  world.player.pos = { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z };
  return world;
}

function foe(world: World): MonsterState {
  return place(world, 'test_shambler', FAR);
}

function withoutLoot(tier: TailwindTier): TailwindTier {
  return { ...tier, loot: 0 };
}

function rankOf(id: string, leader: boolean): MonsterRank {
  return { id, name: id, color: '#ffffff', aura: null, leader, title: null, xp: 1, items: 0, floor: null, size: 1, look: null };
}

function as(monster: MonsterState, def: Partial<MonsterDef>): MonsterState {
  return { ...monster, def: { ...monster.def, ...def } };
}

function slay(world: World, count: number): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let one: number = 0; one < count; one += 1) {
    const monster: MonsterState = foe(world);
    kill(world, monster, SOUTH);
    events.push(...world.events);
  }
  return events;
}

function ends(events: readonly WorldEvent[]): Extract<WorldEvent, { readonly type: 'tailwind_end' }>[] {
  return events.filter((event: WorldEvent): event is Extract<WorldEvent, { readonly type: 'tailwind_end' }> => event.type === 'tailwind_end');
}

function drain(world: World, seconds: number): WorldEvent[] {
  const events: WorldEvent[] = [];
  world.events = [];
  for (let at: number = 0; at < seconds; at += 0.1) {
    world.time += 0.1;
    stepTailwind(world, 0.1);
  }
  events.push(...world.events);
  return events;
}

void test('a kill weighs by its rank: plain one, magic and rare members two, a rare leader and a boss six, a raised one nothing', (): void => {
  const world: World = fresh();
  const plain: MonsterState = foe(world);
  assert.equal(killWeight(RULES, plain), 1);
  assert.equal(killWeight(RULES, as(plain, { rank: rankOf('normal', false) })), 1);
  assert.equal(killWeight(RULES, as(plain, { rank: rankOf('magic', false) })), 2);
  assert.equal(killWeight(RULES, as(plain, { rank: rankOf('rare', false) })), 2);
  assert.equal(killWeight(RULES, as(plain, { rank: rankOf('rare', true) })), 6);
  assert.equal(killWeight(RULES, as(plain, { boss: must([...ARENA_CONTENT.monsters.values()].find((def: MonsterDef): boolean => def.boss !== null), 'a boss').boss })), 6);
  assert.equal(killWeight(RULES, { ...plain, revived: true }), 0);
});

void test('every kill adds to the streak, the tiers rise at their counts and each rise is announced once', (): void => {
  const world: World = fresh();
  const events: WorldEvent[] = slay(world, 2);
  assert.equal(world.tailwind.points, 2);
  assert.equal(world.tailwind.tier, 0);
  events.push(...slay(world, 1));
  assert.equal(world.tailwind.tier, 1);
  events.push(...slay(world, 3));
  assert.equal(world.tailwind.tier, 2);
  assert.equal(world.tailwind.full, 5);
  const rises: number[] = events.flatMap((event: WorldEvent): number[] => (event.type === 'tailwind_rise' ? [event.tier] : []));
  assert.deepEqual(rises, [1, 2]);
  assert.equal(tierAt(RULES, 11), 2);
  assert.equal(tierAt(RULES, 12), 3);
});

void test('the fuse runs out after its length with no kill, and a kill refills it', (): void => {
  const world: World = fresh();
  place(world, 'test_shambler', { x: ARENA_CENTRE.x + 3, z: ARENA_CENTRE.z }).aggro = false;
  slay(world, 1);
  assert.equal(world.tailwind.fuse, 4);
  assert.equal(ends(drain(world, 3)).length, 0);
  slay(world, 1);
  assert.equal(world.tailwind.fuse, 4);
  assert.equal(ends(drain(world, 3.5)).length, 0);
  const ended = ends(drain(world, 1));
  assert.equal(ended.length, 1);
  assert.equal(ended[0]?.reason, 'faded');
  assert.deepEqual(world.tailwind, calmTailwind());
});

void test('kills landing together fill the fuse past its length, up to its cap', (): void => {
  const world: World = fresh();
  slay(world, 2);
  assert.equal(world.tailwind.fuse, 5);
  slay(world, 5);
  assert.equal(world.tailwind.full, 5);
  assert.equal(world.tailwind.fuse, 7.5);
  world.time += 1;
  slay(world, 1);
  assert.equal(world.tailwind.fuse, 7.5);
});

void test('standing still with no foe near drains the fuse twice as fast, and a foe fighting close by slows it', (): void => {
  const alone: World = fresh();
  slay(alone, 1);
  assert.equal(ends(drain(alone, 2.1)).length, 1);
  const watched: World = fresh();
  place(watched, 'test_shambler', { x: ARENA_CENTRE.x + 3, z: ARENA_CENTRE.z }).aggro = false;
  slay(watched, 1);
  assert.equal(ends(drain(watched, 3)).length, 0);
  assert.equal(ends(drain(watched, 1.1)).length, 1);
  const fighting: World = fresh();
  place(fighting, 'test_shambler', { x: ARENA_CENTRE.x + 3, z: ARENA_CENTRE.z });
  slay(fighting, 1);
  assert.equal(ends(drain(fighting, 7.8)).length, 0);
  assert.equal(ends(drain(fighting, 0.4)).length, 1);
});

void test('a streak that reached the second tier pays a windfall of what its kills earned, the first tier pays nothing', (): void => {
  const short: World = fresh();
  slay(short, 4);
  assert.equal(ends(drain(short, 10))[0]?.xp, 0);
  const world: World = fresh();
  const xp: number = world.player.xp;
  const level: number = world.player.level;
  slay(world, 13);
  const earned: number = world.tailwind.xp;
  const dropped: number = world.tailwind.gold;
  const gold: number = world.player.gold;
  const ended = must(ends(drain(world, 20))[0], 'the streak ended');
  assert.equal(ended.best, 3);
  assert.equal(ended.kills, 13);
  assert.equal(ended.xp, Math.round(earned * 0.2));
  assert.ok(ended.xp > 0);
  assert.equal(ended.gold, Math.round(dropped * 0.25));
  assert.equal(world.player.gold - gold, ended.gold);
  assert.ok(world.player.level > level || world.player.xp > xp);
});

void test('kills made while a tier holds give more experience, and the higher tiers walk a little faster', (): void => {
  const plain: World = fresh();
  const before: number = plain.player.xp;
  kill(plain, foe(plain), SOUTH);
  const one: number = plain.player.xp - before;
  const world: World = fresh();
  slay(world, 6);
  assert.deepEqual({ xp: tailwindShares(world).xp, loot: tailwindShares(world).loot }, { xp: 0.2, loot: 0.3 });
  assert.equal(tailwindPace(world), 1.02);
  const held: number = world.player.xp;
  kill(world, foe(world), SOUTH);
  assert.equal(world.player.xp - held, Math.round(one * 1.2));
  assert.equal(tailwindPace(fresh()), 1);
});

void test('kills made while a tier holds drop more gold from the same rolls', (): void => {
  const shambler: MonsterDef = must(CONTENT.monsters.get('test_shambler'), 'test_shambler');
  const coins: Content = { ...CONTENT, monsters: new Map<string, MonsterDef>([...CONTENT.monsters, ['test_shambler', { ...shambler, loot: { ...shambler.loot, goldChance: 1, itemChance: 0 } }]]) };
  const flat: Content = { ...coins, tailwind: { ...RULES, tiers: RULES.tiers.map(withoutLoot) } };
  const plain: World = arena(5, flat);
  const rich: World = arena(5, coins);
  slay(plain, 12);
  slay(rich, 12);
  const before: [number, number] = [plain.tailwind.gold, rich.tailwind.gold];
  slay(plain, 10);
  slay(rich, 10);
  const more: number = (rich.tailwind.gold - before[1]) / Math.max(1, plain.tailwind.gold - before[0]);
  assert.ok(plain.tailwind.gold - before[0] > 0);
  assert.ok(Math.abs(more - 1.4) < 0.1, `${more}`);
});

void test('dying ends the streak at once with no windfall', (): void => {
  const world: World = fresh();
  slay(world, 13);
  world.events = [];
  kill(world, world.player, SOUTH);
  const ended = must(ends(world.events)[0], 'the streak ended');
  assert.equal(ended.reason, 'fell');
  assert.equal(ended.xp, 0);
  assert.equal(ended.gold, 0);
  assert.equal(world.tailwind.points, 0);
  kill(world, foe(world), SOUTH);
  assert.equal(world.tailwind.points, 0);
});

void test('leaving the level ends the streak and pays its windfall', (): void => {
  const world: World = fresh();
  slay(world, 7);
  world.events = [];
  enterZone(world, world.zone, { type: 'start' });
  const ended = must(ends(world.events)[0], 'the streak ended');
  assert.equal(ended.reason, 'left');
  assert.ok(ended.xp > 0);
  assert.equal(world.tailwind.points, 0);
});

function runStreak(): string {
  const world: World = fresh(11);
  const log: WorldEvent[] = [...slay(world, 8), ...drain(world, 2), ...slay(world, 5), ...drain(world, 30)];
  return JSON.stringify({ state: world.tailwind, gold: world.player.gold, xp: world.player.xp, events: log.filter((event: WorldEvent): boolean => event.type.startsWith('tailwind')) });
}

void test('the streak is deterministic: the same kills give the same streak and the same events', (): void => {
  assert.equal(runStreak(), runStreak());
});

void test('a calm streak is not touched by stepping, and ending it again does nothing', (): void => {
  const world: World = fresh();
  world.events = [];
  stepTailwind(world, 1);
  endTailwind(world, 'faded');
  assert.deepEqual(world.events, []);
  feedTailwind(world, as(foe(world), {}), 0, 0);
  assert.equal(world.tailwind.points, 1);
});
