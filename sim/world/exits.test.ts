import assert from 'node:assert/strict';
import { test } from 'node:test';
import { worldIn, zoneOf } from '../../test/support.ts';
import { TOWN_CONTENT } from '../../test/town-support.ts';
import type { Content, QuestDef, ZoneDef, ZoneExit } from '../content/types.ts';
import { exitShown, exitUnder } from './exits.ts';
import type { World } from './types.ts';

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
