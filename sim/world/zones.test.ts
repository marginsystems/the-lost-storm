import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OUTPOST_CONTENT, OUTPOST_ZONE } from '../../test/road-support.ts';
import { finishQuests, must, withoutGlitches, worldIn } from '../../test/support.ts';
import type { Content, ZoneDef, ZoneExit } from '../content/types.ts';
import { distance } from '../math.ts';
import { isWalkable } from '../nav/grid.ts';
import { choicesOpen } from './death.ts';
import { createWorld } from './create.ts';
import { stepWorld } from './step.ts';
import type { Command, MonsterState, World, WorldEvent } from './types.ts';
import { enterZone, findExit, respawnPosition, startZone } from './zones.ts';

const outpost: ZoneDef = OUTPOST_ZONE;
const shipped: Content = OUTPOST_CONTENT;
const town: ZoneDef = startZone(shipped);
const DT: number = 1 / 60;
const LIMIT: number = 40;

type EventOf<T extends WorldEvent['type']> = Extract<WorldEvent, { readonly type: T }>;

function ofType<T extends WorldEvent['type']>(events: readonly WorldEvent[], type: T): EventOf<T>[] {
  return events.filter((event: WorldEvent): event is EventOf<T> => event.type === type);
}

function byId(a: number, b: number): number {
  return a - b;
}

function run(world: World, seconds: number, first: readonly Command[] = []): WorldEvent[] {
  const events: WorldEvent[] = [];
  const steps: number = Math.round(seconds / DT);
  for (let step: number = 0; step < steps; step += 1) events.push(...stepWorld(world, step === 0 ? first : [], DT));
  return events;
}

function travel(world: World, exitId: string): WorldEvent[] {
  const events: WorldEvent[] = [];
  const steps: number = Math.round(LIMIT / DT);
  for (let step: number = 0; step < steps; step += 1) {
    const fresher: WorldEvent[] = stepWorld(world, step === 0 ? [{ type: 'travel', exit: exitId }] : [], DT);
    events.push(...fresher);
    if (ofType(fresher, 'zone_changed').length > 0) break;
  }
  return events;
}

function withCheckpoint(): Content {
  const marked: ZoneDef = { ...outpost, checkpoints: [{ id: 'grate', x: 28, z: 22, radius: 2 }] };
  return { ...shipped, zones: new Map<string, ZoneDef>([...shipped.zones, [marked.id, marked]]) };
}

function killPlayer(world: World): WorldEvent[] {
  const thrall: MonsterState = must(world.monsters[0], 'monster');
  world.monsters = [thrall];
  thrall.spawnTime = 0;
  thrall.pos = { x: world.player.pos.x, z: world.player.pos.z + 1.6 };
  world.player.life = 1;
  world.player.stats.lifeRegen = 0;
  const events: WorldEvent[] = [];
  const steps: number = Math.round(LIMIT / DT);
  for (let step: number = 0; step < steps; step += 1) {
    const fresher: WorldEvent[] = stepWorld(world, choicesOpen(world) ? [{ type: 'respawn', choice: 'checkpoint' }] : [], DT);
    events.push(...fresher);
    if (ofType(fresher, 'player_respawn').length > 0) break;
  }
  return events;
}

void test('a new world starts in the start zone, which is a safe town', (): void => {
  const world: World = createWorld(shipped, { seed: 1, save: null });
  assert.equal(world.zone.id, shipped.world.start);
  assert.equal(world.zone.kind, 'town');
  assert.deepEqual(world.player.pos, { x: town.playerStart.x, z: town.playerStart.z });
  assert.deepEqual(world.respawn, { type: 'start' });
  assert.deepEqual(world.visited, [town.id]);
  assert.equal(world.monsters.length, 0);
  run(world, 8);
  assert.equal(world.monsters.length, 0);
  assert.equal(world.surge, 1);
  assert.equal(world.surgeTimer, null);
});

void test('travel walks to the exit, swaps the zone and grid and places the hero at the far arrival point', (): void => {
  const world: World = finishQuests(createWorld(shipped, { seed: 2, save: null }));
  const oldGrid = world.grid;
  const out: ZoneExit = must(findExit(town, 'outpost_stair'), 'town exit');
  const events: WorldEvent[] = travel(world, out.id);
  assert.deepEqual(ofType(events, 'zone_changed'), [{ type: 'zone_changed', from: town.id, to: outpost.id }]);
  assert.equal(world.zone.id, outpost.id);
  assert.notEqual(world.grid, oldGrid);
  const arrival = must(findExit(outpost, out.toExit), 'outpost exit').arrival;
  assert.deepEqual(world.player.pos, { x: arrival.x, z: arrival.z });
  assert.ok(isWalkable(world.grid, world.player.pos.x, world.player.pos.z));
  assert.deepEqual(world.respawn, { type: 'exit', exit: out.toExit });
  assert.deepEqual(world.visited, [town.id, outpost.id]);
  assert.deepEqual(world.player.intent, { type: 'idle' });
  assert.ok(world.monsters.length > 0);
  assert.ok(world.monsters.every((monster: MonsterState): boolean => monster.alive && isWalkable(world.grid, monster.pos.x, monster.pos.z)));
});

void test('an unknown exit is ignored and walking over an exit without asking does not travel', (): void => {
  const world: World = createWorld(shipped, { seed: 3, save: null });
  const out: ZoneExit = must(findExit(town, 'outpost_stair'), 'town exit');
  run(world, 1, [{ type: 'travel', exit: 'no_such_exit' }]);
  assert.deepEqual(world.player.intent, { type: 'idle' });
  const events: WorldEvent[] = run(world, 6, [{ type: 'move', held: false, dest: { x: out.x, z: out.z } }]);
  assert.ok(distance(world.player.pos, out) <= out.radius);
  assert.equal(ofType(events, 'zone_changed').length, 0);
  assert.equal(world.zone.id, town.id);
});

void test('a wild zone is reset when it is entered again and loot left behind is gone', (): void => {
  const world: World = withoutGlitches(finishQuests(createWorld(shipped, { seed: 4, save: null })));
  travel(world, 'outpost_stair');
  const initial: number = world.monsters.length;
  const firstIds: number[] = world.monsters.map((monster: MonsterState): number => monster.id);
  for (const monster of world.monsters.slice(0, 5)) {
    monster.alive = false;
    monster.life = 0;
  }
  world.ground.push({ id: 9000, pos: { x: 28, z: 30 }, from: { x: 28, z: 30 }, content: { kind: 'gold', amount: 5 }, age: 0, kept: false, find: null });
  const leaving: WorldEvent[] = travel(world, 'stair');
  assert.equal(world.zone.id, town.id);
  assert.equal(world.monsters.length, 0);
  assert.equal(world.ground.length, 0);
  assert.deepEqual(ofType(leaving, 'monster_remove').map((event): number => event.monsterId).toSorted(byId), firstIds.toSorted(byId));
  travel(world, 'outpost_stair');
  assert.equal(world.monsters.length, initial);
  assert.ok(world.monsters.every((monster: MonsterState): boolean => monster.alive && !firstIds.includes(monster.id)));
});

void test('projectiles in flight end when the hero leaves the zone', (): void => {
  const world: World = worldIn(shipped, outpost.id, 5);
  world.monsters = [];
  run(world, 0.25, [{ type: 'skill', slot: 2, aim: { x: 28, z: 20 }, targetId: null }]);
  assert.equal(world.projectiles.length, 1);
  const flying: number = must(world.projectiles[0], 'projectile').id;
  world.events = [];
  enterZone(world, town, { type: 'start' });
  assert.equal(world.projectiles.length, 0);
  assert.ok(ofType(world.events, 'projectile_end').some((event): boolean => event.id === flying));
});

void test('surges only run where the zone has surge rules', (): void => {
  const world: World = worldIn(shipped, outpost.id, 6);
  for (const monster of world.monsters) monster.alive = false;
  const inOutpost: WorldEvent[] = run(world, must(outpost.surge, 'surge rules').delay + 1);
  assert.equal(ofType(inOutpost, 'surge').length, 1);
  assert.equal(world.surge, 2);
  const quiet: ZoneDef = { ...outpost, id: 'quiet', surge: null };
  const content: Content = { ...shipped, zones: new Map<string, ZoneDef>([...shipped.zones, [quiet.id, quiet]]) };
  const calm: World = worldIn(content, quiet.id, 6);
  assert.ok(calm.monsters.every((monster: MonsterState): boolean => monster.level === quiet.level));
  for (const monster of calm.monsters) monster.alive = false;
  const inQuiet: WorldEvent[] = run(calm, 12);
  assert.equal(ofType(inQuiet, 'surge').length, 0);
  assert.equal(ofType(inQuiet, 'surge_cleared').length, 0);
  assert.equal(calm.surge, 1);
  assert.equal(calm.monsters.filter((monster: MonsterState): boolean => monster.alive).length, 0);
});

void test('monster level is the zone level, raised by the surge only in a surge zone', (): void => {
  const deep: ZoneDef = { ...outpost, id: 'deep', level: 4, surge: null };
  const content: Content = { ...shipped, zones: new Map<string, ZoneDef>([...shipped.zones, [deep.id, deep]]) };
  const world: World = worldIn(content, deep.id, 7);
  const thrall: MonsterState = must(world.monsters.find((monster: MonsterState): boolean => monster.def.id === 'bone_thrall'), 'thrall');
  assert.equal(thrall.level, 4);
  assert.equal(thrall.maxLife, Math.round(thrall.def.life * (1 + content.world.scaling.lifePerLevel * 3)));
  assert.ok(Math.abs(thrall.damageMin - thrall.def.damageMin * (1 + content.world.scaling.damagePerLevel * 3)) < 1e-9);
});

void test('a checkpoint is taken once when the hero walks into it', (): void => {
  const world: World = worldIn(withCheckpoint(), outpost.id, 8);
  world.monsters = [];
  const events: WorldEvent[] = run(world, 6, [{ type: 'move', held: false, dest: { x: 28, z: 22 } }]);
  assert.deepEqual(ofType(events, 'checkpoint'), [{ type: 'checkpoint', checkpoint: 'grate', pos: { x: 28, z: 22 } }]);
  assert.deepEqual(world.respawn, { type: 'checkpoint', checkpoint: 'grate' });
  const later: WorldEvent[] = run(world, 2, [{ type: 'move', held: false, dest: { x: 28, z: 23 } }]);
  assert.equal(ofType(later, 'checkpoint').length, 0);
});

void test('death returns the hero to the last checkpoint, or to the exit they came in by', (): void => {
  const marked: World = worldIn(withCheckpoint(), outpost.id, 9);
  marked.respawn = { type: 'checkpoint', checkpoint: 'grate' };
  marked.player.pos = { x: 12, z: 30 };
  assert.equal(ofType(killPlayer(marked), 'player_respawn').length, 1);
  assert.deepEqual(marked.player.pos, { x: 28, z: 22 });
  assert.equal(marked.zone.id, outpost.id);

  const arrived: World = finishQuests(createWorld(shipped, { seed: 10, save: null }));
  travel(arrived, 'outpost_stair');
  arrived.player.pos = { x: 28, z: 20 };
  assert.equal(ofType(killPlayer(arrived), 'player_respawn').length, 1);
  const arrival = must(findExit(outpost, 'stair'), 'stair').arrival;
  assert.deepEqual(arrived.player.pos, { x: arrival.x, z: arrival.z });
});

void test('a respawn id that no longer exists falls back to the zone start', (): void => {
  assert.deepEqual(respawnPosition(outpost, { type: 'checkpoint', checkpoint: 'gone' }), { x: outpost.playerStart.x, z: outpost.playerStart.z });
  assert.deepEqual(respawnPosition(outpost, { type: 'exit', exit: 'gone' }), { x: outpost.playerStart.x, z: outpost.playerStart.z });
  assert.deepEqual(respawnPosition(outpost, { type: 'start' }), { x: outpost.playerStart.x, z: outpost.playerStart.z });
});

void test('travel is queued behind an attack in progress and ignored while dead', (): void => {
  const world: World = finishQuests(createWorld(shipped, { seed: 11, save: null }));
  run(world, 0.02, [{ type: 'skill', slot: 0, aim: { x: 22, z: 10 }, targetId: null }]);
  assert.notEqual(world.player.action, null);
  stepWorld(world, [{ type: 'travel', exit: 'outpost_stair' }], DT);
  assert.deepEqual(world.player.queued, { type: 'travel', exit: 'outpost_stair' });
  run(world, 1);
  assert.deepEqual(world.player.intent, { type: 'travel', exit: 'outpost_stair' });
  const dead: World = createWorld(shipped, { seed: 12, save: null });
  dead.player.alive = false;
  run(dead, 0.5, [{ type: 'travel', exit: 'outpost_stair' }]);
  assert.deepEqual(dead.player.intent, { type: 'idle' });
});

void test('items that did not fit in a loaded save follow the hero into the next zone instead of being lost', (): void => {
  const world: World = finishQuests(createWorld(shipped, { seed: 13, save: null }));
  const spare = must(world.player.equipped.weapon, 'starting weapon');
  world.ground.push({ id: 9100, pos: { x: 22, z: 20 }, from: { x: 22, z: 20 }, content: { kind: 'item', item: spare }, age: 0, kept: true, find: null });
  world.ground.push({ id: 9101, pos: { x: 22, z: 21 }, from: { x: 22, z: 21 }, content: { kind: 'item', item: { ...spare, uid: 777 } }, age: 0, kept: false, find: null });
  travel(world, 'outpost_stair');
  assert.equal(world.zone.id, outpost.id);
  assert.equal(world.ground.length, 1);
  const carried = must(world.ground[0], 'carried item');
  assert.equal(carried.kept, true);
  assert.deepEqual(carried.content, { kind: 'item', item: spare });
  assert.ok(isWalkable(world.grid, carried.pos.x, carried.pos.z));
});
