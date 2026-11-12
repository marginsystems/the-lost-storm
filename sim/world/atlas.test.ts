import assert from 'node:assert/strict';
import { test } from 'node:test';
import { roadAct, roadZone } from '../../test/road-support.ts';
import { finishQuests, must, worldIn, zoneOf } from '../../test/support.ts';
import { actOf } from '../content/atlas.ts';
import { loadContent } from '../content/content.ts';
import type { ActDef, AtlasDef, AtlasRoad, Content, MapPlace, QuestDef, ZoneDef, ZoneExit } from '../content/types.ts';
import { placeState, roadState, zoneMark } from './atlas.ts';
import { createWorld } from './create.ts';
import type { World } from './types.ts';

const content: Content = loadContent();
const act: ActDef = must(actOf(content, 'waystation'), 'act');

function road(from: string, to: string): AtlasRoad {
  return must(act.atlas.roads.find((entry: AtlasRoad): boolean => (entry.from === from && entry.to === to) || (entry.from === to && entry.to === from)), `road ${from} ${to}`);
}

function exitTo(to: string, requires: ZoneExit['requires'], hidden: boolean): ZoneExit {
  return { id: `to_${to}`, x: 4, z: 4, radius: 1.6, to, toExit: 'back', arrival: { x: 8, z: 8 }, requires, lockedHint: 'Barred.', hiddenWhenLocked: hidden };
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
  assert.equal(placeState(shipped, 'shallows'), 'here');
  assert.equal(placeState(shipped, 'waystation'), 'reachable');
  assert.equal(roadState(shipped, road('shallows', 'waystation')), 'open');
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
  assert.equal(zoneMark(content, zoneOf(content, 'waystation')), 'town');
  assert.equal(zoneMark(content, zoneOf(content, 'shallows')), 'wild');
  const lair: ZoneDef = roadZone({ id: 'lair', packs: [{ x: 8, z: 8, members: [{ monster: 'unfinished_colossus', count: 1, mods: [] }], when: [] }] });
  const marks: string[] = [...staged.zones.values(), lair].map((zone): string => zoneMark(staged, zone));
  assert.ok(marks.includes('boss'));
  assert.equal(zoneMark(staged, lair), 'boss');
});

void test('a zone belongs to the act that places it', (): void => {
  for (const zone of [...content.zones.values()].filter((def): boolean => def.kind !== 'void').map((def): string => def.id)) assert.ok(must(actOf(content, zone), 'act').atlas.places.some((place: MapPlace): boolean => place.zone === zone), zone);
  const without = (zone: string): ActDef => ({ ...act, atlas: { ...act.atlas, places: act.atlas.places.filter((place: MapPlace): boolean => place.zone !== zone) } });
  const second: ActDef = { ...act, id: 'act_2', atlas: { ...act.atlas, places: act.atlas.places.filter((place: MapPlace): boolean => place.zone === 'shallows') } };
  const split: Content = { ...content, world: { ...content.world, acts: [without('shallows'), second] } };
  assert.equal(must(actOf(split, 'shallows'), 'act').id, 'act_2');
  assert.equal(must(actOf(split, 'waystation'), 'act').id, 'act_1');
});

void test('a zone no act places falls back to the first act', (): void => {
  const trimmed: ActDef = { ...act, atlas: { ...act.atlas, places: act.atlas.places.filter((place: MapPlace): boolean => place.zone !== 'waystation') } };
  const lost: Content = { ...content, world: { ...content.world, acts: [trimmed] } };
  const found: ActDef = must(actOf(lost, 'waystation'), 'act');
  assert.equal(found, lost.world.acts[0]);
  assert.ok(!found.atlas.places.some((place: MapPlace): boolean => place.zone === 'waystation'));
});
