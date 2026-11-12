import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OUTPOST_CONTENT, OUTPOST_ZONE } from '../../test/road-support.ts';
import { armed, must, worldIn } from '../../test/support.ts';
import type { Content, PackMember, ZoneDef, ZonePack } from '../content/types.ts';
import { generateItem } from '../items.ts';
import type { Vec2 } from '../math.ts';
import { distance, facingOf } from '../math.ts';
import { isWalkable, nearestWalkable } from '../nav/grid.ts';
import { createRng } from '../rng.ts';
import { toSave } from '../save.ts';
import { createWorld } from './create.ts';
import { stepWorld } from './step.ts';
import type { Command, GroundItem, ItemInstance, MonsterState, World, WorldEvent } from './types.ts';

const content: Content = OUTPOST_CONTENT;
const outpost: ZoneDef = OUTPOST_ZONE;
const DT: number = 1 / 60;
const START: Vec2 = { x: 28, z: 37 };

type EventOf<T extends WorldEvent['type']> = Extract<WorldEvent, { readonly type: T }>;

function ofType<T extends WorldEvent['type']>(events: readonly WorldEvent[], type: T): EventOf<T>[] {
  return events.filter((event: WorldEvent): event is EventOf<T> => event.type === type);
}

function fresh(seed: number = 1): World {
  return armed(worldIn(content, outpost.id, seed));
}

function advance(world: World, seconds: number, first: readonly Command[] = []): WorldEvent[] {
  const events: WorldEvent[] = [];
  const steps: number = Math.round(seconds / DT);
  for (let step: number = 0; step < steps; step += 1) events.push(...stepWorld(world, step === 0 ? first : [], DT));
  return events;
}

function advanceUntil(world: World, limit: number, done: (events: readonly WorldEvent[]) => boolean, first: readonly Command[] = []): WorldEvent[] {
  const events: WorldEvent[] = [];
  const steps: number = Math.round(limit / DT);
  for (let step: number = 0; step < steps; step += 1) {
    const fresher: WorldEvent[] = stepWorld(world, step === 0 ? first : [], DT);
    events.push(...fresher);
    if (done(fresher)) break;
  }
  return events;
}

function monstersOf(world: World, id: string): MonsterState[] {
  return world.monsters.filter((monster: MonsterState): boolean => monster.def.id === id);
}

function isolate(world: World, ...keep: MonsterState[]): void {
  world.monsters = keep;
  for (const monster of keep) monster.spawnTime = 0;
}

function put(monster: MonsterState, pos: Vec2): void {
  monster.pos = { x: pos.x, z: pos.z };
}

function around(centre: Vec2, radius: number, index: number, count: number): Vec2 {
  const angle: number = (index / count) * Math.PI * 2;
  return { x: centre.x + Math.cos(angle) * radius, z: centre.z + Math.sin(angle) * radius };
}

function firstGround(world: World, kind: 'gold' | 'item'): GroundItem | undefined {
  return world.ground.find((ground: GroundItem): boolean => ground.content.kind === kind);
}

function annihilate(world: World): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let round: number = 0; round < 12 && world.monsters.some((monster: MonsterState): boolean => monster.alive); round += 1) {
    const living: MonsterState[] = world.monsters.filter((monster: MonsterState): boolean => monster.alive);
    living.forEach((monster: MonsterState, index: number): void => {
      monster.spawnTime = 0;
      monster.life = 1;
      put(monster, around(world.player.pos, index % 2 === 0 ? 2 : 3.4, index, living.length));
    });
    world.player.mana = world.player.stats.maxMana;
    world.player.life = world.player.maxLife;
    world.player.cooldowns = {};
    world.player.action = null;
    events.push(...advance(world, 0.6, [{ type: 'skill', slot: 1, aim: { x: START.x, z: START.z + 1 }, targetId: null }]));
  }
  return events;
}

void test('a fresh world has monsters asleep, the starting weapon equipped and nothing happening', (): void => {
  const world: World = fresh();
  assert.equal(world.surge, 1);
  assert.equal(world.monsters.length, outpost.packs.flatMap((pack: ZonePack): readonly PackMember[] => pack.members).reduce((sum: number, member: PackMember): number => sum + member.count, 0));
  assert.equal(world.player.equipped.weapon?.base, 'rusted_blade');
  assert.deepEqual(world.player.pos, START);
  const events: WorldEvent[] = advance(world, 2);
  assert.equal(ofType(events, 'aggro').length, 0);
  assert.equal(ofType(events, 'damage').length, 0);
  assert.ok(world.monsters.every((monster: MonsterState): boolean => monster.spawnTime === 0 && !monster.aggro));
});

void test('a move command walks the player around a pillar to the destination', (): void => {
  const world: World = fresh();
  world.player.pos = { x: 16, z: 14 };
  const dest: Vec2 = { x: 24, z: 14 };
  isolate(world);
  let sawDetour: boolean = false;
  const events: WorldEvent[] = [];
  for (let step: number = 0; step < 600; step += 1) {
    events.push(...stepWorld(world, step === 0 ? [{ type: 'move', held: false, dest }] : [], DT));
    assert.ok(isWalkable(world.grid, world.player.pos.x, world.player.pos.z), `step ${step}`);
    if (Math.abs(world.player.pos.z - 14) > 1) sawDetour = true;
    if (Math.hypot(world.player.pos.x - dest.x, world.player.pos.z - dest.z) < 0.05) break;
  }
  assert.ok(sawDetour);
  assert.ok(Math.hypot(world.player.pos.x - dest.x, world.player.pos.z - dest.z) < 0.05);
  advance(world, 0.1);
  assert.equal(world.player.intent.type, 'idle');
  assert.equal(world.player.moving, false);
  assert.ok(world.time < 3);
});

void test('a walking player emits a hero_step for each stride travelled and none while standing', (): void => {
  const world: World = fresh();
  isolate(world);
  assert.equal(ofType(advance(world, 1), 'hero_step').length, 0);
  const from: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  const events: WorldEvent[] = advance(world, 1, [{ type: 'move', held: false, dest: { x: 28, z: 25 } }]);
  const travelled: number = Math.hypot(world.player.pos.x - from.x, world.player.pos.z - from.z);
  const steps: readonly EventOf<'hero_step'>[] = ofType(events, 'hero_step');
  assert.ok(travelled > 6);
  assert.ok(steps.length >= 2);
  assert.ok(Math.abs(steps.length - (1.5 + travelled) / 2.5) < 1, `${steps.length} steps over ${travelled}`);
  for (const step of steps) assert.ok(Math.hypot(step.pos.x - world.player.pos.x, step.pos.z - world.player.pos.z) <= travelled + 0.1);
  advance(world, 0.5, [{ type: 'stop' }]);
  assert.equal(ofType(advance(world, 1), 'hero_step').length, 0);
});

void test('a stop command halts a walking player', (): void => {
  const world: World = fresh();
  isolate(world);
  advance(world, 0.3, [{ type: 'move', held: false, dest: { x: 28, z: 25 } }]);
  const at: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  assert.ok(at.z < START.z);
  advance(world, 0.3, [{ type: 'stop' }]);
  assert.ok(Math.hypot(world.player.pos.x - at.x, world.player.pos.z - at.z) < 0.01);
});

void test('a move next to the player is a stop: he neither moves nor turns', (): void => {
  const world: World = fresh();
  const facing: number = world.player.facing;
  advance(world, 0.3, [{ type: 'move', held: false, dest: { x: START.x + 0.4, z: START.z + 0.3 } }]);
  assert.deepEqual(world.player.pos, START);
  assert.equal(world.player.facing, facing);
  assert.equal(world.player.moving, false);
  assert.equal(world.player.intent.type, 'idle');
});

void test('held moves that flip from side to side of the player never turn him', (): void => {
  const world: World = fresh();
  const facing: number = world.player.facing;
  for (let tick: number = 0; tick < 40; tick += 1) {
    const side: number = tick % 2 === 0 ? 1 : -1;
    advance(world, 0.09, [{ type: 'move', held: true, dest: { x: world.player.pos.x + 0.5 * side, z: world.player.pos.z + 0.2 * side } }]);
    assert.equal(world.player.facing, facing);
  }
  assert.deepEqual(world.player.pos, START);
});

void test('a move inside the dead zone stops a walking player', (): void => {
  const world: World = fresh();
  advance(world, 0.4, [{ type: 'move', held: false, dest: { x: START.x, z: START.z - 8 } }]);
  assert.equal(world.player.moving, true);
  const stopped: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  advance(world, 0.3, [{ type: 'move', held: false, dest: { x: stopped.x + 0.3, z: stopped.z } }]);
  assert.equal(world.player.moving, false);
  assert.ok(Math.hypot(world.player.pos.x - stopped.x, world.player.pos.z - stopped.z) < 0.2);
});

void test('a held move onto a blocked spot whose nearest floor is beside the player steps him up to its face, turns him to it and then holds still', (): void => {
  const world: World = fresh();
  isolate(world);
  const grid = world.grid;
  let found: { spot: Vec2; stand: Vec2 } | null = null;
  for (let index: number = 0; index < grid.columns * grid.rows && found === null; index += 1) {
    const spot: Vec2 = { x: ((index % grid.columns) + 0.5) * grid.cellSize, z: (Math.floor(index / grid.columns) + 0.5) * grid.cellSize };
    if (isWalkable(grid, spot.x, spot.z)) continue;
    const snapped: Vec2 | null = nearestWalkable(grid, spot, 1.5);
    if (snapped === null) continue;
    const gap: number = Math.hypot(snapped.x - spot.x, snapped.z - spot.z);
    if (gap < 0.6) continue;
    const stand: Vec2 = { x: snapped.x + ((snapped.x - spot.x) / gap) * 0.4, z: snapped.z + ((snapped.z - spot.z) / gap) * 0.4 };
    if (isWalkable(grid, stand.x, stand.z)) found = { spot, stand };
  }
  const { spot, stand } = must(found, 'a blocked spot with open floor behind its nearest walkable point');
  assert.ok(Math.hypot(stand.x - spot.x, stand.z - spot.z) >= 0.7);
  world.player.pos = { x: stand.x, z: stand.z };
  world.player.facing = facingOf({ x: stand.x - spot.x, z: stand.z - spot.z });
  const settled: { pos: Vec2; facing: number }[] = [];
  for (let tick: number = 0; tick < 40; tick += 1) {
    advance(world, 0.09, [{ type: 'move', held: true, dest: { x: spot.x, z: spot.z } }]);
    assert.ok(distance(world.player.pos, spot) <= distance(stand, spot) + 1e-6, 'the held press pushed him away from the spot');
    if (tick >= 20) settled.push({ pos: { ...world.player.pos }, facing: world.player.facing });
  }
  const last: { pos: Vec2; facing: number } = must(settled.at(-1), 'a settled sample');
  assert.ok(settled.every((sample: { pos: Vec2; facing: number }): boolean => distance(sample.pos, last.pos) < 1e-6 && sample.facing === last.facing), 'he kept shuffling against the face');
  const toward: number = facingOf({ x: spot.x - last.pos.x, z: spot.z - last.pos.z });
  assert.ok(Math.abs(Math.atan2(Math.sin(last.facing - toward), Math.cos(last.facing - toward))) < 0.2, 'he never turned to the held spot');
  assert.ok(distance(last.pos, spot) < distance(stand, spot), 'he did not step up to the face');
});

void test('a held move one unit away leaves a standing player standing, but a click walks there', (): void => {
  const world: World = fresh();
  const origin: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  const near: Vec2 = { x: origin.x, z: origin.z - 1 };
  advance(world, 0.5, [{ type: 'move', held: true, dest: near }]);
  assert.deepEqual(world.player.pos, origin);
  advance(world, 0.6, [{ type: 'move', held: false, dest: near }]);
  assert.ok(Math.hypot(world.player.pos.x - near.x, world.player.pos.z - near.z) < 0.05);
});

void test('a held move three units away walks', (): void => {
  const world: World = fresh();
  const origin: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  advance(world, 0.3, [{ type: 'move', held: true, dest: { x: origin.x, z: origin.z - 3 } }]);
  assert.ok(Math.hypot(world.player.pos.x - origin.x, world.player.pos.z - origin.z) > 1);
});

void test('a move just outside the dead zone still walks there', (): void => {
  const world: World = fresh();
  const dest: Vec2 = { x: START.x + 1, z: START.z };
  advance(world, 0.6, [{ type: 'move', held: false, dest }]);
  assert.ok(Math.hypot(world.player.pos.x - dest.x, world.player.pos.z - dest.z) < 0.05);
  assert.ok(Math.abs(world.player.facing - Math.PI / 2) < 0.2);
});

void test('a skill command with a target walks into range, hits, knocks back and emits damage', (): void => {
  const world: World = fresh();
  const thrall: MonsterState = must(monstersOf(world, 'mended')[0], 'thrall');
  isolate(world, thrall);
  put(thrall, { x: 28, z: 25.5 });
  const events: WorldEvent[] = [];
  let knockAtHit: number = 0;
  for (let step: number = 0; step < 300; step += 1) {
    const fresher: WorldEvent[] = stepWorld(world, step === 0 ? [{ type: 'skill', slot: 0, aim: thrall.pos, targetId: thrall.id }] : [], DT);
    events.push(...fresher);
    if (ofType(fresher, 'damage').some((hit): boolean => hit.targetId === thrall.id)) {
      knockAtHit = Math.hypot(thrall.knock.x, thrall.knock.z);
      break;
    }
  }
  const hits = ofType(events, 'damage').filter((hit): boolean => hit.targetId === thrall.id);
  assert.equal(hits.length, 1);
  const hit = must(hits[0], 'hit');
  assert.equal(hit.sourceId, world.player.id);
  assert.equal(hit.targetTeam, 'monster');
  assert.equal(hit.skill.id, 'cleave');
  assert.ok(hit.amount >= 1);
  assert.equal(thrall.life, thrall.maxLife - hit.amount);
  assert.ok(knockAtHit > 1, `knock ${knockAtHit}`);
  assert.ok(thrall.aggro);
  assert.ok(ofType(events, 'skill_start').some((start): boolean => start.actorId === world.player.id));
  assert.ok(world.player.pos.z < START.z - 5);
});

void test('Thunderclap costs mana, hits every monster around, then goes on cooldown', (): void => {
  const world: World = fresh();
  const thralls: MonsterState[] = monstersOf(world, 'mended').slice(0, 4);
  isolate(world, ...thralls);
  thralls.forEach((thrall: MonsterState, index: number): void => put(thrall, around(START, 2.8, index, 4)));
  const manaBefore: number = world.player.mana;
  const events: WorldEvent[] = advance(world, 0.5, [{ type: 'skill', slot: 1, aim: { x: START.x, z: START.z - 1 }, targetId: null }]);
  const impact = must(ofType(events, 'skill_impact').find((entry): boolean => entry.skill.id === 'thunderclap'), 'impact');
  assert.equal(impact.hits, 4);
  assert.equal(ofType(events, 'damage').filter((hit): boolean => hit.skill.id === 'thunderclap').length, 4);
  const cost: number = must(content.skills.get('thunderclap'), 'skill').manaCost;
  assert.ok(world.player.mana <= manaBefore - cost + 3 * 0.5 + 0.01);
  assert.ok(world.player.mana >= manaBefore - cost);
  assert.ok((world.player.cooldowns['thunderclap'] ?? 0) > 2);
  assert.ok(thralls.every((thrall: MonsterState): boolean => thrall.life < thrall.maxLife));
});

void test('Thunderclap again straight away is refused as on cooldown, and without mana as no_mana', (): void => {
  const world: World = fresh();
  isolate(world, must(monstersOf(world, 'mended')[0], 'thrall'));
  const cast: Command = { type: 'skill', slot: 1, aim: { x: START.x, z: START.z - 1 }, targetId: null };
  advance(world, 0.1, [cast]);
  const events: WorldEvent[] = advance(world, 1, [cast]);
  assert.ok(ofType(events, 'notice').some((notice): boolean => notice.reason === 'on_cooldown'));
  assert.equal(ofType(events, 'skill_start').length, 0);

  const dry: World = fresh();
  isolate(dry, must(monstersOf(dry, 'mended')[0], 'thrall'));
  dry.player.mana = 0;
  dry.player.stats.manaRegen = 0;
  const refused: WorldEvent[] = advance(dry, 0.2, [cast]);
  assert.ok(ofType(refused, 'notice').some((notice): boolean => notice.reason === 'no_mana'));
  assert.equal(ofType(refused, 'skill_start').length, 0);
});

void test('Storm Bolt spawns a projectile that travels, hits a monster in its path and ends', (): void => {
  const world: World = fresh();
  const thrall: MonsterState = must(monstersOf(world, 'mended')[0], 'thrall');
  isolate(world, thrall);
  put(thrall, { x: 28, z: 30 });
  thrall.life = 500;
  thrall.maxLife = 500;
  const events: WorldEvent[] = [];
  let spawnedAt: Vec2 | null = null;
  let movedTo: Vec2 | null = null;
  for (let step: number = 0; step < 120; step += 1) {
    const fresher: WorldEvent[] = stepWorld(world, step === 0 ? [{ type: 'skill', slot: 2, aim: thrall.pos, targetId: thrall.id }] : [], DT);
    events.push(...fresher);
    const bolt = world.projectiles[0];
    if (bolt !== undefined && spawnedAt === null) spawnedAt = { x: bolt.pos.x, z: bolt.pos.z };
    else if (bolt !== undefined && movedTo === null) movedTo = { x: bolt.pos.x, z: bolt.pos.z };
  }
  assert.equal(ofType(events, 'projectile_spawn').length, 1);
  const from: Vec2 = must(spawnedAt, 'spawn position');
  const later: Vec2 = must(movedTo, 'later position');
  assert.ok(Math.hypot(later.x - from.x, later.z - from.z) > 0.3);
  const hit = must(ofType(events, 'damage').find((entry): boolean => entry.skill.id === 'storm_bolt'), 'bolt hit');
  assert.equal(hit.targetId, thrall.id);
  assert.ok(Math.hypot(hit.pos.x - START.x, hit.pos.z - START.z) > 3);
  const ends = ofType(events, 'projectile_end');
  assert.equal(ends.length, 1);
  assert.equal(must(ends[0], 'end').hit, false);
  assert.equal(world.projectiles.length, 0);
});

void test('a Storm Bolt with nothing in its way flies its full range and ends without a hit', (): void => {
  const world: World = fresh();
  const thrall: MonsterState = must(monstersOf(world, 'mended')[0], 'thrall');
  isolate(world, thrall);
  put(thrall, { x: 50, z: 6 });
  const events: WorldEvent[] = advance(world, 1.5, [{ type: 'skill', slot: 2, aim: { x: 9, z: START.z }, targetId: null }]);
  const end = must(ofType(events, 'projectile_end')[0], 'end');
  assert.equal(end.hit, false);
  assert.ok(Math.abs(end.pos.x - (START.x - 0.9 - 19)) < 0.5);
  assert.ok(Math.abs(end.pos.z - START.z) < 0.01);
  assert.equal(ofType(events, 'damage').length, 0);
});

void test('Forked Bolt fires three projectiles', (): void => {
  const world: World = fresh();
  isolate(world, must(monstersOf(world, 'mended')[0], 'thrall'));
  world.player.skillPoints = 4;
  advance(world, 0.1, [{ type: 'allocate', node: 'storm_storm_bolt' }]);
  advance(world, 0.1, [{ type: 'allocate', node: 'stormcallers_focus' }]);
  advance(world, 0.1, [{ type: 'allocate', node: 'storm_1' }]);
  advance(world, 0.1, [{ type: 'allocate', node: 'forked_bolt' }]);
  assert.deepEqual(world.player.allocated, ['storm_storm_bolt', 'stormcallers_focus', 'storm_1', 'forked_bolt']);
  const events: WorldEvent[] = advance(world, 0.5, [{ type: 'skill', slot: 2, aim: { x: 9, z: START.z }, targetId: null }]);
  assert.equal(ofType(events, 'projectile_spawn').length, 3);
});

void test('monsters aggro when the player comes close, and the whole pack wakes together', (): void => {
  const world: World = fresh();
  const pack: MonsterState[] = world.monsters.filter((monster: MonsterState): boolean => monster.packId === must(monstersOf(world, 'mended')[0], 'thrall').packId);
  assert.ok(pack.length >= 4);
  isolate(world, ...pack);
  pack.forEach((monster: MonsterState, index: number): void => put(monster, around({ x: 28, z: 24 }, 1.5, index, pack.length)));
  const far: WorldEvent[] = advance(world, 0.5);
  assert.equal(ofType(far, 'aggro').length, 0);
  world.player.pos = { x: 28, z: 31 };
  const near: WorldEvent[] = advance(world, 0.2);
  const woken: Set<number> = new Set<number>(ofType(near, 'aggro').map((event): number => event.monsterId));
  assert.equal(woken.size, pack.length);
  assert.ok(pack.every((monster: MonsterState): boolean => monster.aggro));
});

void test('a chaser closes in and damages the player', (): void => {
  const world: World = fresh();
  const thrall: MonsterState = must(monstersOf(world, 'mended')[0], 'thrall');
  isolate(world, thrall);
  put(thrall, { x: 28, z: 28 });
  const events: WorldEvent[] = advance(world, 3);
  const hits = ofType(events, 'damage').filter((hit): boolean => hit.targetTeam === 'player');
  assert.ok(hits.length >= 1);
  const hit = must(hits[0], 'hit');
  assert.equal(hit.sourceId, thrall.id);
  assert.equal(hit.skill.id, 'mended_rhythm');
  assert.ok(hit.amount >= 4 && hit.amount <= 7);
  assert.ok(Math.hypot(thrall.pos.x - world.player.pos.x, thrall.pos.z - world.player.pos.z) < 2.5);
});

void test('a ranged monster fires a projectile from a distance', (): void => {
  const world: World = fresh();
  const caller: MonsterState = must(monstersOf(world, 'mender')[0], 'caller');
  isolate(world, caller);
  put(caller, { x: 28, z: 28 });
  let spawnGap: number = 0;
  const events: WorldEvent[] = [];
  for (let step: number = 0; step < 300; step += 1) {
    const fresher: WorldEvent[] = stepWorld(world, [], DT);
    events.push(...fresher);
    if (spawnGap === 0 && ofType(fresher, 'projectile_spawn').length > 0) spawnGap = Math.hypot(caller.pos.x - world.player.pos.x, caller.pos.z - world.player.pos.z);
  }
  const spawned = ofType(events, 'projectile_spawn');
  assert.ok(spawned.length >= 1);
  const bolt = must(spawned[0], 'bolt').projectile;
  assert.equal(bolt.ownerId, caller.id);
  assert.equal(bolt.team, 'monster');
  assert.equal(bolt.skill.id, 'mender_needle');
  assert.ok(spawnGap > 4, `gap ${spawnGap}`);
  assert.ok(ofType(events, 'damage').some((hit): boolean => hit.targetTeam === 'player' && hit.skill.id === 'mender_needle'));
});

void test('killing monsters emits death, grants xp, levels up and a skill point can be spent', (): void => {
  const world: World = fresh();
  const thralls: MonsterState[] = monstersOf(world, 'mended').slice(0, 6);
  isolate(world, ...thralls, must(monstersOf(world, 'mender')[0], 'caller'));
  thralls.forEach((thrall: MonsterState, index: number): void => {
    put(thrall, around(START, 2.6, index, thralls.length));
    thrall.life = 1;
  });
  put(must(world.monsters.at(-1), 'caller'), { x: 50, z: 6 });
  const events: WorldEvent[] = advance(world, 0.5, [{ type: 'skill', slot: 1, aim: { x: START.x, z: START.z - 1 }, targetId: null }]);
  const deaths = ofType(events, 'death').filter((death): boolean => death.team === 'monster');
  assert.equal(deaths.length, 6);
  assert.equal(world.player.kills, 6);
  assert.equal(world.player.level, 2);
  assert.equal(world.player.xp, 0);
  assert.equal(world.player.skillPoints, world.content.chart.pointsPerLevel);
  assert.equal(ofType(events, 'xp').reduce((sum: number, entry): number => sum + entry.amount, 0), 60);
  assert.deepEqual(ofType(events, 'level_up').map((entry): number => entry.level), [2]);
  assert.equal(world.player.life, world.player.maxLife);

  const lifeBefore: number = world.player.stats.maxLife;
  const changed: WorldEvent[] = advance(world, 0.1, [{ type: 'allocate', node: 'stone_thunderclap' }, { type: 'allocate', node: 'tempered_body' }]);
  assert.ok(ofType(changed, 'character_changed').length > 0);
  assert.deepEqual(world.player.allocated, ['stone_thunderclap', 'tempered_body']);
  assert.equal(world.player.skillPoints, world.content.chart.pointsPerLevel - 2);
  assert.equal(world.player.stats.maxLife, lifeBefore + 30);
  assert.equal(world.player.maxLife, lifeBefore + 30);

  advance(world, 0.1, [{ type: 'allocate', node: 'bedrock' }]);
  assert.deepEqual(world.player.allocated, ['stone_thunderclap', 'tempered_body']);
});

void test('dead monsters stay as corpses for a while and are then removed', (): void => {
  const world: World = fresh();
  const thrall: MonsterState = must(monstersOf(world, 'mended')[0], 'thrall');
  const caller: MonsterState = must(monstersOf(world, 'mender')[0], 'caller');
  isolate(world, thrall, caller);
  put(caller, { x: 50, z: 6 });
  put(thrall, { x: 28, z: 35 });
  thrall.life = 1;
  const early: WorldEvent[] = advance(world, 1, [{ type: 'skill', slot: 0, aim: thrall.pos, targetId: thrall.id }]);
  assert.equal(thrall.alive, false);
  assert.ok(world.monsters.includes(thrall));
  assert.equal(ofType(early, 'monster_remove').length, 0);
  const late: WorldEvent[] = advance(world, 6);
  assert.deepEqual(ofType(late, 'monster_remove').map((entry): number => entry.monsterId), [thrall.id]);
  assert.ok(!world.monsters.includes(thrall));
});

void test('loot: gold is collected near the player and items can be picked up and equipped', (): void => {
  const world: World = fresh(3);
  const events: WorldEvent[] = annihilate(world);
  assert.equal(world.monsters.filter((monster: MonsterState): boolean => monster.alive).length, 0);
  assert.ok(ofType(events, 'drop').length > 0);
  const gold: GroundItem = must(firstGround(world, 'gold'), 'gold drop');
  const amount: number = gold.content.kind === 'gold' ? gold.content.amount : 0;
  assert.ok(amount >= 1);
  const goldBefore: number = world.player.gold;
  world.player.pos = { x: gold.pos.x + 0.5, z: gold.pos.z };
  world.player.pos = must(nearestWalkable(world.grid, world.player.pos, 2), 'walkable');
  const collected: WorldEvent[] = advance(world, 0.8);
  assert.ok(ofType(collected, 'pickup').some((entry): boolean => entry.ground.id === gold.id));
  assert.ok(!world.ground.some((entry: GroundItem): boolean => entry.id === gold.id));
  assert.ok(world.player.gold >= goldBefore + amount);

  const drop: GroundItem = must(firstGround(world, 'item'), 'item drop');
  const dropped: ItemInstance | null = drop.content.kind === 'item' ? drop.content.item : null;
  const item: ItemInstance = must(dropped, 'dropped item');
  const taken: WorldEvent[] = advanceUntil(world, 15, (fresher): boolean => ofType(fresher, 'pickup').some((entry): boolean => entry.ground.id === drop.id), [{ type: 'pickup', groundId: drop.id }]);
  assert.ok(ofType(taken, 'pickup').some((entry): boolean => entry.ground.id === drop.id));
  assert.ok(world.player.inventory.some((entry: ItemInstance | null): boolean => entry?.uid === item.uid));
  assert.ok(!world.ground.some((entry: GroundItem): boolean => entry.id === drop.id));
});

void test('equipping a better weapon raises damage, unequip returns it, drop puts it on the ground', (): void => {
  const world: World = fresh();
  const greatsword: ItemInstance = must(generateItem(content, createRng(4), 900, 5, 'tempest_greatsword', 'rare'), 'sword');
  world.player.inventory[0] = greatsword;
  const before: number = world.player.stats.damageMax;
  const events: WorldEvent[] = advance(world, 0.1, [{ type: 'equip', inventoryIndex: 0 }]);
  assert.ok(ofType(events, 'character_changed').length > 0);
  assert.ok(world.player.stats.damageMax > before + 5);
  assert.equal(world.player.equipped.weapon?.uid, 900);
  assert.equal(world.player.inventory.at(0)?.base, 'rusted_blade');

  advance(world, 0.1, [{ type: 'unequip', slot: 'weapon' }]);
  assert.equal(world.player.equipped.weapon, null);
  assert.ok(world.player.stats.damageMax < before);

  advance(world, 0.1, [{ type: 'drop', inventoryIndex: 1 }]);
  assert.equal(world.player.inventory[1], null);
  assert.ok(world.ground.some((ground: GroundItem): boolean => ground.content.kind === 'item' && ground.content.item.uid === 900));
});

void test('a full inventory refuses an unequip with a notice', (): void => {
  const world: World = fresh();
  const filler: ItemInstance = must(generateItem(content, createRng(1), 1, 1, 'gale_charm', 'common'), 'charm');
  world.player.inventory.fill(filler);
  const events: WorldEvent[] = advance(world, 0.1, [{ type: 'unequip', slot: 'weapon' }]);
  assert.ok(ofType(events, 'notice').some((notice): boolean => notice.reason === 'inventory_full'));
  assert.equal(world.player.equipped.weapon?.base, 'rusted_blade');
});

void test('commands are ignored while the player is dead', (): void => {
  const world: World = fresh();
  isolate(world, must(monstersOf(world, 'mended')[0], 'thrall'));
  world.player.alive = false;
  const events: WorldEvent[] = advance(world, 0.3, [{ type: 'move', held: false, dest: { x: 28, z: 20 } }]);
  assert.deepEqual(world.player.pos, START);
  assert.equal(ofType(events, 'skill_start').length, 0);
});

void test('clearing every monster fires surge_cleared and then a stronger surge spawns', (): void => {
  const world: World = fresh(5);
  const firstLife: number = must(monstersOf(world, 'mended')[0], 'thrall').maxLife;
  const initial: number = world.monsters.length;
  const cleared: WorldEvent[] = annihilate(world);
  const all: WorldEvent[] = [...cleared, ...advance(world, 7)];
  const clearedEvents = ofType(all, 'surge_cleared');
  assert.equal(clearedEvents.length, 1);
  assert.equal(must(clearedEvents[0], 'cleared').surge, 1);
  assert.equal(must(clearedEvents[0], 'cleared').delay, must(outpost.surge, 'surge rules').delay);
  assert.deepEqual(ofType(all, 'surge').map((entry): number => entry.surge), [2]);
  assert.equal(world.surge, 2);
  assert.equal(world.monsters.length, initial);
  assert.ok(world.monsters.every((monster: MonsterState): boolean => monster.alive && monster.level === 2));
  const secondLife: number = must(monstersOf(world, 'mended')[0], 'thrall').maxLife;
  assert.ok(secondLife > firstLife);
  assert.equal(secondLife, Math.round(firstLife * (1 + content.world.scaling.lifePerLevel)));
  assert.equal(ofType(all, 'monster_spawn').length, initial);
});

void test('later surges add extra monsters to the first member of each pack', (): void => {
  const base: World = fresh();
  const world: World = createWorld(content, { seed: 1, save: { ...toSave(base), surge: 3 } });
  assert.equal(world.monsters.length, base.monsters.length + outpost.packs.length);
});

interface SoakResult {
  readonly kills: number;
  readonly deaths: number;
  readonly level: number;
  readonly surge: number;
  readonly steps: number;
}

function finite(pos: Vec2): boolean {
  return Number.isFinite(pos.x) && Number.isFinite(pos.z);
}

function botCommand(world: World): Command | null {
  const player = world.player;
  if (!player.alive) return null;
  let nearest: MonsterState | null = null;
  let nearestGap: number = Infinity;
  let crowd: number = 0;
  for (const monster of world.monsters) {
    if (!monster.alive) continue;
    const gap: number = Math.hypot(monster.pos.x - player.pos.x, monster.pos.z - player.pos.z);
    if (gap < 4) crowd += 1;
    if (gap < nearestGap) {
      nearest = monster;
      nearestGap = gap;
    }
  }
  if (nearest === null) return null;
  const ready = (slot: number): boolean => {
    const skill = player.skills[slot] ?? undefined;
    return skill !== undefined && (player.cooldowns[skill.id] ?? 0) <= 0 && player.mana >= skill.manaCost;
  };
  const target: number = nearest.id;
  if (crowd >= 3 && ready(1)) return { type: 'skill', slot: 1, aim: nearest.pos, targetId: null };
  if (ready(2)) return { type: 'skill', slot: 2, aim: nearest.pos, targetId: target };
  return { type: 'skill', slot: 0, aim: nearest.pos, targetId: target };
}

function soak(seed: number, minutes: number): SoakResult {
  const world: World = fresh(seed);
  let deaths: number = 0;
  const steps: number = Math.round((minutes * 60) / DT);
  for (let step: number = 0; step < steps; step += 1) {
    const command: Command | null = botCommand(world);
    const events: WorldEvent[] = stepWorld(world, command === null ? [] : [command], DT);
    deaths += ofType(events, 'death').filter((death): boolean => death.team === 'player').length;
    assert.ok(finite(world.player.pos) && finite(world.player.knock), `player at step ${step}`);
    assert.ok(Number.isFinite(world.player.life) && Number.isFinite(world.player.mana), `player vitals at step ${step}`);
    if (world.player.alive) assert.ok(nearestWalkable(world.grid, world.player.pos, 1) !== null, `player off the floor at step ${step}`);
    for (const monster of world.monsters) {
      assert.ok(finite(monster.pos) && finite(monster.knock), `monster ${monster.id} at step ${step}`);
      assert.ok(Number.isFinite(monster.life), `monster ${monster.id} life at step ${step}`);
      if (monster.alive) assert.ok(nearestWalkable(world.grid, monster.pos, 1) !== null, `monster ${monster.id} off the floor at step ${step}`);
    }
    for (const projectile of world.projectiles) assert.ok(finite(projectile.pos), `projectile at step ${step}`);
  }
  return { kills: world.player.kills, deaths, level: world.player.level, surge: world.surge, steps };
}

void test('a scripted bot can play three minutes without errors, NaN or leaving the floor, and makes progress', (): void => {
  const result: SoakResult = soak(11, 3);
  assert.equal(result.steps, 10800);
  assert.ok(result.kills > 20, `kills ${result.kills}`);
  assert.ok(result.level >= 3, `level ${result.level}`);
});

void test('the soak is deterministic for a seed', (): void => {
  assert.deepEqual(soak(4, 0.5), soak(4, 0.5));
});
