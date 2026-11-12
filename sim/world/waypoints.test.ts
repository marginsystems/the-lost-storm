import assert from 'node:assert/strict';
import { test } from 'node:test';
import { roadContent, roadZone } from '../../test/road-support.ts';
import { finishQuests, must, withoutGlitches, zoneOf } from '../../test/support.ts';
import type { Content, ZoneDef, ZoneWaypoint } from '../content/types.ts';
import { createWorld } from './create.ts';
import { stepWorld } from './step.ts';
import { choicesOpen } from './death.ts';
import type { Command, MonsterState, World, WorldEvent } from './types.ts';
import { canTeleport, onWaypoint, waypointAt } from './waypoints.ts';
import { enterZone } from './zones.ts';

const outpostZone: ZoneDef = roadZone({
  id: 'outpost',
  tiles: ['wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww'],
  waypoint: { x: 21, z: 8, radius: 1.8 },
  packs: [{ x: 12, z: 8, members: [{ monster: 'mended', count: 2, mods: [] }], when: [] }],
});
const roads: Content = roadContent(outpostZone);
const content: Content = roads;
const town: ZoneDef = zoneOf(content, 'hideout');
const outpost: ZoneDef = zoneOf(content, 'outpost');
const townPoint: ZoneWaypoint = must(town.waypoint, 'town waypoint');
const outpostPoint: ZoneWaypoint = must(outpost.waypoint, 'outpost waypoint');
const DT: number = 1 / 60;
const LIMIT: number = 40;

type EventOf<T extends WorldEvent['type']> = Extract<WorldEvent, { readonly type: T }>;

function ofType<T extends WorldEvent['type']>(events: readonly WorldEvent[], type: T): EventOf<T>[] {
  return events.filter((event: WorldEvent): event is EventOf<T> => event.type === type);
}

function until(world: World, done: () => boolean, first: readonly Command[] = []): WorldEvent[] {
  const events: WorldEvent[] = [];
  const steps: number = Math.round(LIMIT / DT);
  for (let step: number = 0; step < steps; step += 1) {
    events.push(...stepWorld(world, step === 0 ? first : choicesOpen(world) ? [{ type: 'respawn', choice: 'checkpoint' }] : [], DT));
    if (done()) break;
  }
  return events;
}

function fresh(seed: number): World {
  const world: World = finishQuests(createWorld(content, { seed, save: null }));
  enterZone(world, town, { type: 'start' });
  world.events = [];
  return world;
}

function standOn(world: World, point: ZoneWaypoint): WorldEvent[] {
  return until(world, (): boolean => onWaypoint(world), [{ type: 'move', held: false, dest: { x: point.x, z: point.z } }]);
}

void test('a waypoint unlocks once, when the hero first stands on it', (): void => {
  const world: World = fresh(1);
  assert.deepEqual(world.waypoints, []);
  assert.equal(onWaypoint(world), false);
  const events: WorldEvent[] = standOn(world, townPoint);
  assert.deepEqual(ofType(events, 'waypoint_unlocked'), [{ type: 'waypoint_unlocked', zone: town.id }]);
  assert.deepEqual(world.waypoints, [town.id]);
  const again: WorldEvent[] = until(world, (): boolean => false, [{ type: 'move', held: false, dest: { x: townPoint.x + 0.4, z: townPoint.z } }]).slice(0, 600);
  assert.equal(ofType(again, 'waypoint_unlocked').length, 0);
});

void test('teleport needs the hero on a waypoint and the target unlocked', (): void => {
  const world: World = fresh(2);
  world.waypoints = [town.id, outpost.id];
  assert.equal(canTeleport(world, outpost.id), false);
  stepWorld(world, [{ type: 'teleport', zone: outpost.id }], DT);
  assert.equal(world.zone.id, town.id);
  standOn(world, townPoint);
  world.waypoints = [town.id];
  assert.equal(canTeleport(world, outpost.id), false);
  stepWorld(world, [{ type: 'teleport', zone: outpost.id }], DT);
  assert.equal(world.zone.id, town.id);
  world.waypoints = [town.id, outpost.id];
  assert.equal(canTeleport(world, town.id), false);
  assert.equal(canTeleport(world, 'nowhere'), false);
  assert.equal(canTeleport(world, outpost.id), true);
});

void test('teleport enters the target zone at its waypoint, resets it, and death returns the hero there', (): void => {
  const world: World = withoutGlitches(fresh(3));
  standOn(world, townPoint);
  world.waypoints = [town.id, outpost.id];
  const events: WorldEvent[] = stepWorld(world, [{ type: 'teleport', zone: outpost.id }], DT);
  assert.deepEqual(ofType(events, 'zone_changed'), [{ type: 'zone_changed', from: town.id, to: outpost.id }]);
  assert.equal(world.zone.id, outpost.id);
  assert.deepEqual(world.player.pos, { x: outpostPoint.x, z: outpostPoint.z });
  assert.deepEqual(world.respawn, { type: 'waypoint' });
  assert.ok(world.monsters.length > 0);
  assert.equal(onWaypoint(world), true);
  const thrall: MonsterState = must(world.monsters[0], 'monster');
  world.monsters = [thrall];
  thrall.spawnTime = 0;
  world.player.pos = { x: 20, z: 12 };
  thrall.pos = { x: 20, z: 13.6 };
  world.player.life = 1;
  world.player.stats.lifeRegen = 0;
  const died: WorldEvent[] = until(world, (): boolean => world.player.alive && world.player.life === world.player.maxLife && world.time > 3);
  assert.equal(ofType(died, 'player_respawn').length, 1);
  assert.deepEqual(world.player.pos, { x: outpostPoint.x, z: outpostPoint.z });
  const back: WorldEvent[] = stepWorld(world, [{ type: 'teleport', zone: town.id }], DT);
  assert.equal(ofType(back, 'zone_changed').length, 1);
  assert.deepEqual(world.player.pos, { x: townPoint.x, z: townPoint.z });
  assert.equal(world.monsters.length, 0);
});

void test('the dead cannot teleport', (): void => {
  const world: World = fresh(4);
  standOn(world, townPoint);
  world.waypoints = [town.id, outpost.id];
  world.player.alive = false;
  stepWorld(world, [{ type: 'teleport', zone: outpost.id }], DT);
  assert.equal(world.zone.id, town.id);
});

void test('a point inside the waypoint circle is on it, one outside is not, and a zone with no waypoint has none', (): void => {
  const world: World = createWorld(content, { seed: 9, save: null });
  enterZone(world, outpostZone, { type: 'start' });
  assert.equal(waypointAt(world, { x: 22, z: 8.5 }), true);
  assert.equal(waypointAt(world, { x: 23, z: 8 }), false);
  world.zone = { ...world.zone, waypoint: null };
  assert.equal(waypointAt(world, { x: 21, z: 8 }), false);
});
