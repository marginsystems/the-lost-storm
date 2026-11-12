import assert from 'node:assert/strict';
import { test } from 'node:test';
import { finishQuests, must, worldIn, zoneOf } from '../../test/support.ts';
import { actOf } from '../content/atlas.ts';
import { loadContent } from '../content/content.ts';
import type { ActDef, AtlasRoad, Content, MapPlace } from '../content/types.ts';
import { placeState, roadState, zoneMark } from './atlas.ts';
import { createWorld } from './create.ts';
import type { World } from './types.ts';

const content: Content = loadContent();
const act: ActDef = must(actOf(content, 'stillhold'), 'act');

function road(from: string, to: string): AtlasRoad {
  return must(act.atlas.roads.find((entry: AtlasRoad): boolean => (entry.from === from && entry.to === to) || (entry.from === to && entry.to === from)), `road ${from} ${to}`);
}

void test('a new hero sees the town lit, open neighbours dim, barred ones locked and the rest unknown', (): void => {
  const world: World = createWorld(content, { seed: 1, save: null });
  assert.equal(placeState(world, 'stillhold'), 'here');
  assert.equal(placeState(world, 'duskway'), 'reachable');
  assert.equal(placeState(world, 'the_spill'), 'reachable');
  assert.equal(placeState(world, 'the_still'), 'locked');
  assert.equal(placeState(world, 'drowned_bastion'), 'locked');
  assert.equal(placeState(world, 'dusks_end'), 'unknown');
  assert.equal(placeState(world, 'the_coursework'), 'unknown');
  assert.equal(roadState(world, road('stillhold', 'duskway')), 'open');
  assert.equal(roadState(world, road('stillhold', 'the_still')), 'locked');
  assert.equal(roadState(world, road('duskway', 'dusks_end')), 'hidden');
});

void test('quests open barred roads and walking a road lights the far end', (): void => {
  const opened: World = finishQuests(createWorld(content, { seed: 1, save: null }));
  assert.equal(placeState(opened, 'drowned_bastion'), 'reachable');
  assert.equal(roadState(opened, road('stillhold', 'the_still')), 'open');
  const walked: World = worldIn(content, 'duskway', 1);
  assert.equal(placeState(walked, 'duskway'), 'here');
  assert.equal(placeState(walked, 'stillhold'), 'visited');
  assert.equal(placeState(walked, 'dusks_end'), 'reachable');
  assert.equal(roadState(walked, road('duskway', 'dusks_end')), 'open');
});

void test('a zone is marked by its kind, and a zone with a boss pack is a boss zone', (): void => {
  assert.equal(zoneMark(content, zoneOf(content, 'stillhold')), 'town');
  assert.equal(zoneMark(content, zoneOf(content, 'duskway')), 'wild');
  const marks: string[] = [...content.zones.values()].map((zone): string => zoneMark(content, zone));
  assert.ok(marks.includes('boss'));
});

void test('a zone belongs to the act that places it', (): void => {
  for (const zone of [...content.zones.values()].filter((def): boolean => def.kind !== 'void').map((def): string => def.id)) assert.ok(must(actOf(content, zone), 'act').atlas.places.some((place: MapPlace): boolean => place.zone === zone), zone);
  const without = (zone: string): ActDef => ({ ...act, atlas: { ...act.atlas, places: act.atlas.places.filter((place: MapPlace): boolean => place.zone !== zone) } });
  const second: ActDef = { ...act, id: 'act_2', atlas: { ...act.atlas, places: act.atlas.places.filter((place: MapPlace): boolean => place.zone === 'duskway') } };
  const split: Content = { ...content, world: { ...content.world, acts: [without('duskway'), second] } };
  assert.equal(must(actOf(split, 'duskway'), 'act').id, 'act_2');
  assert.equal(must(actOf(split, 'stillhold'), 'act').id, 'act_1');
});

void test('a zone no act places falls back to the first act', (): void => {
  const trimmed: ActDef = { ...act, atlas: { ...act.atlas, places: act.atlas.places.filter((place: MapPlace): boolean => place.zone !== 'stillhold') } };
  const lost: Content = { ...content, world: { ...content.world, acts: [trimmed] } };
  const found: ActDef = must(actOf(lost, 'stillhold'), 'act');
  assert.equal(found, lost.world.acts[0]);
  assert.ok(!found.atlas.places.some((place: MapPlace): boolean => place.zone === 'stillhold'));
});
