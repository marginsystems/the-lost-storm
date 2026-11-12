import assert from 'node:assert/strict';
import { test } from 'node:test';
import { finishQuests, must, worldIn, zoneOf } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef, ZoneExit } from '../content/types.ts';
import { createWorld } from './create.ts';
import { firstExitToward, questMarks } from './map-marks.ts';
import type { NpcState, World } from './types.ts';

const content: Content = loadContent();

void test('a talk objective in this zone marks the person to talk to', (): void => {
  const world: World = createWorld(content, { seed: 1, save: null });
  const maren: NpcState = must(world.npcs.find((npc: NpcState): boolean => npc.def.id === 'maren'), 'maren');
  const marks = questMarks(world);
  assert.deepEqual(marks, [{ quest: 'fallen_in', pos: { x: maren.pos.x, z: maren.pos.z }, here: true }]);
});

void test('an objective in another zone marks the exit that leads toward it', (): void => {
  const world: World = worldIn(content, 'stillhold', 2);
  world.quests = { fallen_in: 2, north_lamp: 1 };
  const marks = questMarks(world).filter((mark): boolean => mark.quest === 'north_lamp');
  const exit = must(world.zone.exits.find((candidate): boolean => candidate.to === 'duskway'), 'north gate');
  assert.deepEqual(marks, [{ quest: 'north_lamp', pos: { x: exit.x, z: exit.z }, here: false }]);
});

void test('a reach objective in this zone marks its spot', (): void => {
  const world: World = worldIn(content, 'dusks_end', 3);
  world.quests = { fallen_in: 2, north_lamp: 1 };
  const mark = must(questMarks(world).find((candidate): boolean => candidate.quest === 'north_lamp'), 'mark');
  assert.deepEqual(mark, { quest: 'north_lamp', pos: { x: 38, z: 9.6 }, here: true });
});

void test('no exit is found toward an unreachable zone', (): void => {
  const world: World = worldIn(content, 'stillhold', 4);
  assert.equal(firstExitToward(world, ['atlantis']), null);
});

void test('a route never runs through a hidden locked gate further along the way', (): void => {
  const town: ZoneDef = zoneOf(content, 'stillhold');
  const zones: Map<string, ZoneDef> = new Map<string, ZoneDef>(content.zones);
  zones.set('stillhold', { ...town, exits: town.exits.filter((exit: ZoneExit): boolean => exit.id !== 'gate') });
  const narrowed: Content = { ...content, zones };
  const world: World = worldIn(narrowed, 'duskway', 5);
  assert.equal(firstExitToward(world, ['the_still']), null);
  finishQuests(world);
  assert.equal(must(firstExitToward(world, ['the_still']), 'route').to, 'stillhold');
});
