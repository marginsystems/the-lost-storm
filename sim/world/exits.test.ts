import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn, zoneOf } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import { TOWN_CONTENT } from '../../test/town-support.ts';
import type { Content, QuestDef, ZoneDef, ZoneExit } from '../content/types.ts';
import { exitShown, exitUnder } from './exits.ts';
import { stepWorld } from './step.ts';
import type { World, WorldEvent } from './types.ts';

const DT: number = 1 / 30;

const march: QuestDef = {
  id: 'march',
  name: 'The March',
  requires: [],
  when: [],
  objectives: [{ id: 'ask', type: 'talk', npc: 'keeper', text: 'Ask', when: [], sets: {} }],
};

function exit(id: string, x: number, hiddenWhenLocked: boolean): ZoneExit {
  return { id, x, z: 4, radius: 1.6, to: 'outpost', toExit: 'gate', arrival: { x: 8, z: 8 }, requires: [{ type: 'quest', quest: 'march', is: 'done', not: false }], lockedHint: 'Shut.', hiddenWhenLocked, look: 'ring' };
}

const secret: ZoneExit = exit('secret', 26, true);
const barred: ZoneExit = exit('barred', 40, false);

function gated(): Content {
  const hub: ZoneDef = zoneOf(TOWN_CONTENT, 'hub');
  const zone: ZoneDef = { ...hub, exits: [...hub.exits, secret, barred] };
  return { ...TOWN_CONTENT, quests: new Map<string, QuestDef>([[march.id, march]]), zones: new Map<string, ZoneDef>([...TOWN_CONTENT.zones, [zone.id, zone]]) };
}

const content: Content = gated();

void test('a locked exit that hides while locked is not shown, a plain locked one is', (): void => {
  const world: World = worldIn(content, 'hub', 1);
  assert.equal(exitShown(world, secret), false);
  assert.equal(exitShown(world, barred), true);
});

void test('a hidden exit is shown once what it requires holds', (): void => {
  const world: World = worldIn(content, 'hub', 2);
  world.quests = { march: 1 };
  assert.equal(exitShown(world, secret), true);
});

void test('the exit under a point is the shown one whose circle holds it', (): void => {
  const world: World = worldIn(content, 'hub', 3);
  assert.equal(exitUnder(world, { x: 26.5, z: 4.5 }), null);
  assert.equal(exitUnder(world, { x: 40.5, z: 4.5 })?.id, 'barred');
  assert.equal(exitUnder(world, { x: 43, z: 4 }), null);
  world.quests = { march: 1 };
  assert.equal(exitUnder(world, { x: 26.5, z: 4.5 })?.id, 'secret');
});

void test('the Hall\'s gate to the boss lair stays shut below level 8 with its hint, and takes the hero in once the level is reached', (): void => {
  const shipped: Content = loadContent();
  const world: World = worldIn(shipped, 'hall_of_time', 2);
  const gate: ZoneExit = must(world.zone.exits.find((candidate: ZoneExit): boolean => candidate.to === 'keepers_gate'), 'gate');
  world.player.level = 7;
  assert.equal(exitShown(world, gate), true);
  const refused: WorldEvent[] = stepWorld(world, [{ type: 'travel', exit: gate.id }], DT);
  assert.deepEqual(refused.filter((event: WorldEvent): boolean => event.type === 'exit_locked'), [{ type: 'exit_locked', exit: gate.id, hint: gate.lockedHint }]);
  assert.match(gate.lockedHint, /level 8/);
  world.player.level = 8;
  world.player.pos = { x: gate.arrival.x, z: gate.arrival.z };
  stepWorld(world, [{ type: 'travel', exit: gate.id }], DT);
  for (let step: number = 0; step < 600 && world.zone.id === 'hall_of_time'; step += 1) stepWorld(world, [], DT);
  assert.equal(world.zone.id, 'keepers_gate');
});

void test('walking over the open gate does not take the hero through: only the travel command does', (): void => {
  const shipped: Content = loadContent();
  const world: World = worldIn(shipped, 'hall_of_time', 3);
  const gate: ZoneExit = must(world.zone.exits.find((candidate: ZoneExit): boolean => candidate.to === 'keepers_gate'), 'gate');
  world.player.level = 10;
  world.player.pos = { x: gate.arrival.x, z: gate.arrival.z };
  stepWorld(world, [{ type: 'move', held: false, dest: { x: gate.x, z: gate.z } }], DT);
  for (let step: number = 0; step < 300; step += 1) stepWorld(world, [], DT);
  assert.equal(world.zone.id, 'hall_of_time');
});
