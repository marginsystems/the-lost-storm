import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, zoneOf } from '../../test/support.ts';
import { loadContent } from './content.ts';
import type { MarkerKind } from './marker-types.ts';
import type { Place } from './markers.ts';
import { exitRole, markerDressing, markerProblems, placeKey, samePlace, zonePlaces } from './markers.ts';
import type { Content, ZoneDef, ZoneExit } from './types.ts';

const content: Content = loadContent();

function placeFor(zone: ZoneDef, key: string): Place {
  return must(zonePlaces(content, zone).find((place: Place): boolean => placeKey(place.ref) === key), `${zone.id} has no ${key}`);
}

void test('every zone with a waypoint stands a waypoint model on it', (): void => {
  for (const zone of content.zones.values()) {
    if (zone.waypoint === null) continue;
    assert.equal(placeFor(zone, 'waypoint').kind.id, content.markers.roles.waypoint, zone.id);
  }
});

void test('a way to a deeper level is a way down and a way back is a way up', (): void => {
  const caves: ZoneDef = zoneOf(content, 'under_hall_2');
  assert.equal(placeFor(caves, 'exit:down').kind.id, content.markers.roles.down);
  assert.equal(placeFor(caves, 'exit:up').kind.id, content.markers.roles.up);
  for (const zone of content.zones.values()) {
    for (const exit of zone.exits) {
      const target: ZoneDef = zoneOf(content, exit.to);
      assert.equal(exitRole(content, zone, exit), target.level > zone.level ? 'down' : 'up', `${zone.id} ${exit.id}`);
    }
  }
});

void test('every way out of a zone faces the spot a hero arrives on in front of it', (): void => {
  const hall: ZoneDef = zoneOf(content, 'ledger_hall');
  const up: ZoneExit = must(hall.exits.find((exit: ZoneExit): boolean => exit.id === 'up'), 'ledger hall up');
  const facing = placeFor(hall, 'exit:up').facing;
  assert.ok(facing !== null);
  assert.ok(Math.abs(Math.hypot(facing.x, facing.z) - 1) < 1e-9);
  assert.ok(facing.x * (up.arrival.x - up.x) + facing.z * (up.arrival.z - up.z) > 0);
});

void test('a way through the mist and the ways out of a void stand no model', (): void => {
  const hall: ZoneDef = zoneOf(content, 'hall_of_time');
  assert.equal(zonePlaces(content, hall).some((place: Place): boolean => placeKey(place.ref) === 'exit:mist'), false);
  assert.deepEqual(zonePlaces(content, zoneOf(content, 'between')), []);
});

void test('every checkpoint stands a marker stone', (): void => {
  const caves: ZoneDef = zoneOf(content, 'under_hall');
  for (const checkpoint of caves.checkpoints) assert.equal(placeFor(caves, `checkpoint:${checkpoint.id}`).kind.id, content.markers.roles.checkpoint);
});

void test('a zone dresses the stone of its markers in its own surface and leaves the lit parts alone', (): void => {
  const kind: MarkerKind = must(content.markers.kinds.get(content.markers.roles.waypoint), 'waypoint kind');
  const caves: ZoneDef = zoneOf(content, 'under_hall');
  assert.deepEqual(markerDressing(kind, caves), { ...kind.surfaces, stone: 'cave_stone' });
  assert.deepEqual(markerDressing(kind, { ...caves, markerSurfaces: { glyph: 'cave_stone' } }), kind.surfaces);
});

void test('a marker named on a place wins over the default for its role', (): void => {
  const caves: ZoneDef = zoneOf(content, 'under_hall_2');
  const renamed: ZoneDef = { ...caves, exits: caves.exits.map((exit: ZoneExit): ZoneExit => Object.assign({}, exit, { marker: content.markers.roles.down })) };
  assert.equal(placeFor(renamed, 'exit:up').kind.id, content.markers.roles.down);
});

void test('places compare by what they mark', (): void => {
  assert.equal(samePlace({ type: 'exit', exit: 'down' }, { type: 'exit', exit: 'down' }), true);
  assert.equal(samePlace({ type: 'exit', exit: 'down' }, { type: 'exit', exit: 'up' }), false);
  assert.equal(samePlace({ type: 'waypoint' }, null), false);
  assert.equal(samePlace(null, null), true);
});

void test('the shipped markers have no problems and a broken name or surface is caught', (): void => {
  assert.deepEqual(markerProblems(content), []);
  const caves: ZoneDef = zoneOf(content, 'under_hall');
  const broken: ZoneDef = { ...caves, markerSurfaces: { stone: 'no_such_surface' }, exits: caves.exits.map((exit: ZoneExit): ZoneExit => Object.assign({}, exit, { marker: 'no_such_marker' })) };
  const problems: string[] = markerProblems({ ...content, zones: new Map<string, ZoneDef>([[broken.id, broken]]) });
  assert.ok(problems.some((problem: string): boolean => problem.includes('no_such_surface')));
  assert.ok(problems.some((problem: string): boolean => problem.includes('no_such_marker')));
});
