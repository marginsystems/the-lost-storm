import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn, zoneOf } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { MarkerKind } from '../../sim/content/marker-types.ts';
import type { Place } from '../../sim/content/markers.ts';
import { placeKey, zonePlaces } from '../../sim/content/markers.ts';
import type { Content, ZoneDef, ZoneExit } from '../../sim/content/types.ts';
import type { World } from '../../sim/world/types.ts';
import { CAMERA } from './iso-camera.ts';
import { facingYaw, levelTarget, placeState } from './place-markers.ts';

const content: Content = loadContent();
const waypointKind: MarkerKind = must(content.markers.kinds.get(content.markers.roles.waypoint), 'waypoint kind');

void test('a waypoint sleeps until the hero has reached it and wakes once he has', (): void => {
  const world: World = worldIn(content, 'under_hall', 9);
  world.waypoints.splice(0, world.waypoints.length);
  assert.equal(placeState(world, { type: 'waypoint' }).awake, false);
  world.waypoints.push('under_hall');
  assert.equal(placeState(world, { type: 'waypoint' }).awake, true);
});

void test('a locked way is shut, and hidden while it says so', (): void => {
  const world: World = worldIn(content, 'keepers_gate', 1);
  const under: ZoneExit = must(world.zone.exits.find((exit: ZoneExit): boolean => exit.id === 'under'), 'the way under');
  assert.equal(under.hiddenWhenLocked, true);
  const state = placeState(world, { type: 'exit', exit: 'under' });
  assert.equal(state.open, false);
  assert.equal(state.shown, false);
  assert.equal(placeState(world, { type: 'exit', exit: 'hall' }).open, true);
});

void test('a way glows brightest while the hero travels through it', (): void => {
  const world: World = worldIn(content, 'under_hall_2', 14);
  world.player.intent = { type: 'travel', exit: 'down' };
  assert.equal(placeState(world, { type: 'exit', exit: 'down' }).busy, true);
  assert.equal(placeState(world, { type: 'exit', exit: 'up' }).busy, false);
});

void test('the levels rise from asleep to awake to under the pointer to in use', (): void => {
  const asleep = { shown: true, open: true, awake: false, busy: false };
  const awake = { ...asleep, awake: true };
  assert.equal(levelTarget(waypointKind, asleep, false, false), waypointKind.levels.dormant);
  assert.ok(levelTarget(waypointKind, asleep, true, false) > waypointKind.levels.dormant);
  assert.equal(levelTarget(waypointKind, awake, false, false), waypointKind.levels.awake);
  assert.equal(levelTarget(waypointKind, awake, true, false), waypointKind.levels.aimed);
  assert.equal(levelTarget(waypointKind, awake, false, true), waypointKind.levels.used);
  assert.equal(levelTarget(waypointKind, { ...awake, busy: true }, false, false), waypointKind.levels.used);
});

void test('a way out turns to face its arrival spot and a waypoint turns to the camera', (): void => {
  const hall: ZoneDef = zoneOf(content, 'ledger_hall');
  const places: Place[] = zonePlaces(content, hall);
  const up: Place = must(places.find((place: Place): boolean => placeKey(place.ref) === 'exit:up'), 'ledger hall up');
  const facing = must(up.facing, 'facing');
  const yaw: number = facingYaw(up);
  assert.ok(Math.abs(Math.sin(yaw) - facing.x) < 1e-9 && Math.abs(Math.cos(yaw) - facing.z) < 1e-9);
  const stone: Place = must(places.find((place: Place): boolean => place.ref.type === 'waypoint'), 'waypoint');
  assert.equal(facingYaw(stone), (CAMERA.yawDegrees * Math.PI) / 180);
});
