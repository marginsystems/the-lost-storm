import assert from 'node:assert/strict';
import { test } from 'node:test';
import { roadZone } from '../../test/road-support.ts';
import { finishQuests, must, worldIn, zoneOf } from '../../test/support.ts';
import { TOWN_CONTENT } from '../../test/town-support.ts';
import type { Content, QuestDef, ZoneDef, ZoneExit } from '../content/types.ts';
import { createWorld } from './create.ts';
import { firstExitToward, questMarks } from './map-marks.ts';
import type { NpcState, World } from './types.ts';

const march: QuestDef = {
  id: 'march',
  name: 'The March',
  requires: [],
  when: [],
  objectives: [
    { id: 'ask', type: 'talk', npc: 'keeper', text: 'Ask', when: [], sets: {} },
    { id: 'go', type: 'reach', zone: 'outpost', x: 38, z: 9.6, radius: 2, text: 'Go', when: [], sets: {} },
  ],
};

const ridge: ZoneDef = roadZone({ id: 'ridge', exits: [{ id: 'descent', x: 4, z: 8, radius: 1.6, to: 'hub', toExit: 'gate', arrival: { x: 8, z: 8 }, requires: [], lockedHint: '', hiddenWhenLocked: false, look: 'ring' }] });

function gate(): ZoneExit {
  return { id: 'gate', x: 26, z: 4, radius: 1.6, to: 'ridge', toExit: 'descent', arrival: { x: 8, z: 8 }, requires: [{ type: 'quest', quest: 'march', is: 'done', not: false }], lockedHint: 'Shut.', hiddenWhenLocked: true, look: 'ring' };
}

function marched(): Content {
  const hub: ZoneDef = zoneOf(TOWN_CONTENT, 'hub');
  const gated: ZoneDef = { ...hub, exits: [...hub.exits, gate()] };
  return { ...TOWN_CONTENT, quests: new Map<string, QuestDef>([[march.id, march]]), zones: new Map<string, ZoneDef>([...TOWN_CONTENT.zones, [gated.id, gated], [ridge.id, ridge]]) };
}

const content: Content = marched();

void test('a talk objective in this zone marks the person to talk to', (): void => {
  const world: World = createWorld(content, { seed: 1, save: null });
  const keeper: NpcState = must(world.npcs.find((npc: NpcState): boolean => npc.def.id === 'keeper'), 'keeper');
  const marks = questMarks(world);
  assert.deepEqual(marks, [{ quest: 'march', pos: { x: keeper.pos.x, z: keeper.pos.z }, here: true }]);
});

void test('an objective in another zone marks the exit that leads toward it', (): void => {
  const world: World = worldIn(content, 'hub', 2);
  world.quests = { march: 1 };
  const marks = questMarks(world).filter((mark): boolean => mark.quest === 'march');
  const exit = must(world.zone.exits.find((candidate): boolean => candidate.to === 'outpost'), 'way out');
  assert.deepEqual(marks, [{ quest: 'march', pos: { x: exit.x, z: exit.z }, here: false }]);
});

void test('a reach objective in this zone marks its spot', (): void => {
  const world: World = worldIn(content, 'outpost', 3);
  world.quests = { march: 1 };
  const mark = must(questMarks(world).find((candidate): boolean => candidate.quest === 'march'), 'mark');
  assert.deepEqual(mark, { quest: 'march', pos: { x: 38, z: 9.6 }, here: true });
});

void test('no exit is found toward an unreachable zone', (): void => {
  const world: World = worldIn(content, 'hub', 4);
  assert.equal(firstExitToward(world, ['atlantis']), null);
});

void test('a route never runs through a hidden locked gate further along the way', (): void => {
  const hub: ZoneDef = zoneOf(content, 'hub');
  const zones: Map<string, ZoneDef> = new Map<string, ZoneDef>(content.zones);
  zones.set('hub', { ...hub, exits: hub.exits.filter((exit: ZoneExit): boolean => exit.id !== 'gate') });
  const narrowed: Content = { ...content, zones };
  const world: World = worldIn(narrowed, 'outpost', 5);
  assert.equal(firstExitToward(world, ['ridge']), null);
  finishQuests(world);
  assert.equal(firstExitToward(world, ['ridge']), null);
  const open: World = worldIn(content, 'outpost', 5);
  assert.equal(firstExitToward(open, ['ridge']), null);
  finishQuests(open);
  assert.equal(must(firstExitToward(open, ['ridge']), 'route').to, 'hub');
});
