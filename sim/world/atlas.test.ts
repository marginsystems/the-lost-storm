import assert from 'node:assert/strict';
import { test } from 'node:test';
import { roadAct, roadZone } from '../../test/road-support.ts';
import { finishQuests, must, worldIn, zoneOf } from '../../test/support.ts';
import { actOf } from '../content/atlas.ts';
import { loadContent } from '../content/content.ts';
import type { ActDef, AtlasDef, AtlasRoad, Content, MapPlace, QuestDef, ZoneDef, ZoneExit, ZoneWaypoint } from '../content/types.ts';
import { placeState, roadState, zoneMark } from './atlas.ts';
import { createWorld } from './create.ts';
import { canTeleport, onWaypoint } from './waypoints.ts';
import type { World } from './types.ts';

const content: Content = loadContent();
const act: ActDef = must(actOf(content, 'hall_of_time'), 'act');

function exitTo(to: string, requires: ZoneExit['requires'], hidden: boolean): ZoneExit {
  return { id: `to_${to}`, x: 4, z: 4, radius: 1.6, to, toExit: 'back', arrival: { x: 8, z: 8 }, requires, lockedHint: 'Barred.', hiddenWhenLocked: hidden, look: 'ring' };
}

const errand: QuestDef = { id: 'errand', name: 'An Errand', requires: [], when: [], objectives: [{ id: 'go', type: 'reach', zone: 'hub', x: 8, z: 8, radius: 2, text: 'Go', when: [], sets: {} }] };
const barred: ZoneExit['requires'] = [{ type: 'quest', quest: 'errand', is: 'done', not: false }];
const hub: ZoneDef = roadZone({ id: 'hub', kind: 'town', exits: [{ ...exitTo('vale', [], false), id: 'to_vale' }, exitTo('keep', barred, false)] });
const vale: ZoneDef = roadZone({ id: 'vale', exits: [exitTo('hub', [], false), exitTo('peak', [], false), exitTo('hollow', barred, true)] });
const keep: ZoneDef = roadZone({ id: 'keep', exits: [exitTo('hub', [], false)] });
const peak: ZoneDef = roadZone({ id: 'peak', exits: [exitTo('vale', [], false)] });
const hollow: ZoneDef = roadZone({ id: 'hollow', exits: [exitTo('vale', [], false)] });
const atlas: AtlasDef = {
  ...act.atlas,
  places: ['hub', 'vale', 'keep', 'peak', 'hollow'].map((zone: string, index: number): MapPlace => ({ zone, x: 100 + index * 100, y: 200 })),
  roads: [['hub', 'vale'], ['hub', 'keep'], ['vale', 'peak'], ['vale', 'hollow']].map(([from, to]): AtlasRoad => ({ from: from ?? '', to: to ?? '', via: [] })),
};
const mapped: Content = { ...roadAct([hub, vale, keep, peak, hollow], 'hub'), quests: new Map<string, QuestDef>([[errand.id, errand]]) };
const staged: Content = { ...mapped, world: { ...mapped.world, acts: [{ ...act, atlas }] } };
const mapRoad = (from: string, to: string): AtlasRoad => must(atlas.roads.find((entry: AtlasRoad): boolean => (entry.from === from && entry.to === to) || (entry.from === to && entry.to === from)), `road ${from} ${to}`);

void test('a new hero sees the town lit, open neighbours dim, barred ones locked and the rest unknown', (): void => {
  const world: World = createWorld(staged, { seed: 1, save: null });
  assert.equal(placeState(world, 'hub'), 'here');
  assert.equal(placeState(world, 'vale'), 'reachable');
  assert.equal(placeState(world, 'keep'), 'locked');
  assert.equal(placeState(world, 'peak'), 'unknown');
  assert.equal(placeState(world, 'hollow'), 'unknown');
  assert.equal(roadState(world, mapRoad('hub', 'vale')), 'open');
  assert.equal(roadState(world, mapRoad('hub', 'keep')), 'locked');
  assert.equal(roadState(world, mapRoad('vale', 'peak')), 'hidden');
  const shipped: World = createWorld(content, { seed: 1, save: null });
  assert.equal(placeState(shipped, 'hall_of_time'), 'here');
  assert.equal(placeState(shipped, 'hideout'), 'reachable');
});

void test('quests open barred roads and walking a road lights the far end', (): void => {
  const opened: World = finishQuests(createWorld(staged, { seed: 1, save: null }));
  assert.equal(placeState(opened, 'keep'), 'reachable');
  assert.equal(roadState(opened, mapRoad('hub', 'keep')), 'open');
  const walked: World = worldIn(staged, 'vale', 1);
  assert.equal(placeState(walked, 'vale'), 'here');
  assert.equal(placeState(walked, 'hub'), 'visited');
  assert.equal(placeState(walked, 'peak'), 'reachable');
  assert.equal(roadState(walked, mapRoad('vale', 'peak')), 'open');
  assert.equal(roadState(walked, mapRoad('vale', 'hollow')), 'hidden');
  assert.equal(placeState(walked, 'hollow'), 'unknown');
});

void test('a zone is marked by its kind, and a zone with a boss pack is a boss zone', (): void => {
  assert.equal(zoneMark(content, zoneOf(content, 'hall_of_time')), 'wild');
  assert.equal(zoneMark(content, zoneOf(content, 'hideout')), 'town');
  assert.equal(zoneMark(staged, vale), 'wild');
  const lair: ZoneDef = roadZone({ id: 'lair', packs: [{ x: 8, z: 8, members: [{ monster: 'unfinished_colossus', count: 1, mods: [] }], when: [] }] });
  const marks: string[] = [...staged.zones.values(), lair].map((zone): string => zoneMark(staged, zone));
  assert.ok(marks.includes('boss'));
  assert.equal(zoneMark(staged, lair), 'boss');
});

void test('a zone belongs to the act that places it', (): void => {
  for (const zone of [...content.zones.values()].filter((def): boolean => def.kind !== 'void').map((def): string => def.id)) assert.ok(must(actOf(content, zone), 'act').atlas.places.some((place: MapPlace): boolean => place.zone === zone), zone);
  const first: ActDef = { ...act, atlas };
  const without = (zone: string): ActDef => ({ ...first, atlas: { ...atlas, places: atlas.places.filter((place: MapPlace): boolean => place.zone !== zone) } });
  const second: ActDef = { ...first, id: 'act_2', atlas: { ...atlas, places: atlas.places.filter((place: MapPlace): boolean => place.zone === 'vale') } };
  const split: Content = { ...staged, world: { ...staged.world, acts: [without('vale'), second] } };
  assert.equal(must(actOf(split, 'vale'), 'act').id, 'act_2');
  assert.equal(must(actOf(split, 'hub'), 'act').id, 'act_1');
});

void test('a zone no act places falls back to the first act', (): void => {
  const trimmed: ActDef = { ...act, atlas: { ...act.atlas, places: act.atlas.places.filter((place: MapPlace): boolean => place.zone !== 'hall_of_time') } };
  const lost: Content = { ...content, world: { ...content.world, acts: [trimmed] } };
  const found: ActDef = must(actOf(lost, 'hall_of_time'), 'act');
  assert.equal(found, lost.world.acts[0]);
  assert.ok(!found.atlas.places.some((place: MapPlace): boolean => place.zone === 'hall_of_time'));
});

void test('the act shows the In-Between, the Hall of Time and the Hideout west to east, joined in the order the hero walks them', (): void => {
  assert.deepEqual(
    act.atlas.places.map((place: MapPlace): string => place.zone),
    ['between', 'hall_of_time', 'hideout'],
  );
  for (const place of act.atlas.places) assert.ok(content.zones.has(place.zone), place.zone);
  const xs: number[] = act.atlas.places.map((place: MapPlace): number => place.x);
  assert.deepEqual(xs, xs.toSorted((a: number, b: number): number => a - b));
  assert.deepEqual(
    act.atlas.roads.map((road: AtlasRoad): string => `${road.from} ${road.to}`),
    ['between hall_of_time', 'hall_of_time hideout'],
  );
  const placed: Set<string> = new Set<string>(act.atlas.places.map((place: MapPlace): string => place.zone));
  for (const road of act.atlas.roads) assert.ok(placed.has(road.from) && placed.has(road.to), `${road.from} ${road.to}`);
});

void test('you are here in each of the three zones, the In-Between included', (): void => {
  for (const zone of ['between', 'hall_of_time', 'hideout']) {
    const world: World = worldIn(content, zone, 1);
    assert.equal(must(actOf(content, zone), 'act'), act);
    assert.equal(placeState(world, zone), 'here', zone);
    for (const other of act.atlas.places.filter((place: MapPlace): boolean => place.zone !== zone)) assert.notEqual(placeState(world, other.zone), 'here');
  }
});

void test('the In-Between is marked a void and is never offered for travel, even from a lit waypoint', (): void => {
  assert.equal(zoneMark(content, zoneOf(content, 'between')), 'void');
  const town: World = worldIn(content, 'hideout', 1);
  const stone: ZoneWaypoint = must(town.zone.waypoint, 'hideout waypoint');
  town.player.pos = { x: stone.x, z: stone.z };
  town.waypoints.push('between', 'hall_of_time', 'hideout');
  assert.ok(onWaypoint(town));
  assert.equal(canTeleport(town, 'between'), false);
  assert.equal(zoneOf(content, 'between').waypoint, null);
});
