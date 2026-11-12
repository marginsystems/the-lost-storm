import assert from 'node:assert/strict';
import { test } from 'node:test';
import { finishQuests, must, zoneOf } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef, ZoneWaypoint } from '../content/types.ts';
import { createWorld } from './create.ts';
import { stepWorld } from './step.ts';
import { choicesOpen } from './death.ts';
import type { Command, MonsterState, World, WorldEvent } from './types.ts';
import { canTeleport, onWaypoint } from './waypoints.ts';

const content: Content = loadContent();
const town: ZoneDef = zoneOf(content, 'stillhold');
const bastion: ZoneDef = zoneOf(content, 'drowned_bastion');
const townPoint: ZoneWaypoint = must(town.waypoint, 'town waypoint');
const bastionPoint: ZoneWaypoint = must(bastion.waypoint, 'bastion waypoint');
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
  return finishQuests(createWorld(content, { seed, save: null }));
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
  world.waypoints = [town.id, bastion.id];
  assert.equal(canTeleport(world, bastion.id), false);
  stepWorld(world, [{ type: 'teleport', zone: bastion.id }], DT);
  assert.equal(world.zone.id, town.id);
  standOn(world, townPoint);
  world.waypoints = [town.id];
  assert.equal(canTeleport(world, bastion.id), false);
  stepWorld(world, [{ type: 'teleport', zone: bastion.id }], DT);
  assert.equal(world.zone.id, town.id);
  world.waypoints = [town.id, bastion.id];
  assert.equal(canTeleport(world, town.id), false);
  assert.equal(canTeleport(world, 'nowhere'), false);
  assert.equal(canTeleport(world, bastion.id), true);
});

void test('teleport enters the target zone at its waypoint, resets it, and death returns the hero there', (): void => {
  const world: World = fresh(3);
  standOn(world, townPoint);
  world.waypoints = [town.id, bastion.id];
  const events: WorldEvent[] = stepWorld(world, [{ type: 'teleport', zone: bastion.id }], DT);
  assert.deepEqual(ofType(events, 'zone_changed'), [{ type: 'zone_changed', from: town.id, to: bastion.id }]);
  assert.equal(world.zone.id, bastion.id);
  assert.deepEqual(world.player.pos, { x: bastionPoint.x, z: bastionPoint.z });
  assert.deepEqual(world.respawn, { type: 'waypoint' });
  assert.ok(world.monsters.length > 0);
  assert.equal(onWaypoint(world), true);
  const thrall: MonsterState = must(world.monsters[0], 'monster');
  world.monsters = [thrall];
  thrall.spawnTime = 0;
  world.player.pos = { x: 28, z: 20 };
  thrall.pos = { x: 28, z: 21.6 };
  world.player.life = 1;
  world.player.stats.lifeRegen = 0;
  const died: WorldEvent[] = until(world, (): boolean => world.player.alive && world.player.life === world.player.maxLife && world.time > 3);
  assert.equal(ofType(died, 'player_respawn').length, 1);
  assert.deepEqual(world.player.pos, { x: bastionPoint.x, z: bastionPoint.z });
  const back: WorldEvent[] = stepWorld(world, [{ type: 'teleport', zone: town.id }], DT);
  assert.equal(ofType(back, 'zone_changed').length, 1);
  assert.deepEqual(world.player.pos, { x: townPoint.x, z: townPoint.z });
  assert.equal(world.monsters.length, 0);
});

void test('the dead cannot teleport', (): void => {
  const world: World = fresh(4);
  standOn(world, townPoint);
  world.waypoints = [town.id, bastion.id];
  world.player.alive = false;
  stepWorld(world, [{ type: 'teleport', zone: bastion.id }], DT);
  assert.equal(world.zone.id, town.id);
});
