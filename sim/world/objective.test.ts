import assert from 'node:assert/strict';
import { test } from 'node:test';
import { worldIn } from '../../test/support.ts';
import { TOWN_CONTENT } from '../../test/town-support.ts';
import type { Content, QuestDef } from '../content/types.ts';
import { nextAction, objectiveTarget } from './objective.ts';
import type { ObjectiveTarget } from './objective.ts';
import { startQuests } from './quests.ts';
import type { World } from './types.ts';

const errand: QuestDef = {
  id: 'errand',
  name: 'An Errand',
  requires: [],
  when: [],
  objectives: [
    { id: 'ask', type: 'talk', npc: 'keeper', text: 'Ask', when: [], sets: {} },
    { id: 'go', type: 'reach', zone: 'outpost', x: 28, z: 30, radius: 2, text: 'Go', when: [], sets: {} },
  ],
};

const content: Content = { ...TOWN_CONTENT, quests: new Map<string, QuestDef>([[errand.id, errand]]) };

function fresh(zone: string): World {
  const world: World = worldIn(content, zone, 1);
  startQuests(world);
  return world;
}

void test('a talk objective in this zone points at the person', (): void => {
  const world: World = fresh(content.world.start);
  const target: ObjectiveTarget | null = objectiveTarget(world);
  assert.equal(target?.kind, 'person');
  assert.match(nextAction(target, ''), /^Talk to /);
});

void test('an objective in another zone points at the exit that leads there', (): void => {
  const world: World = fresh(content.world.start);
  world.quests['errand'] = 1;
  const target: ObjectiveTarget | null = objectiveTarget(world);
  assert.ok(target !== null);
  assert.equal(target.kind, 'exit');
  assert.ok(world.zone.exits.some((exit): boolean => exit.x === target.pos.x && exit.z === target.pos.z));
});

void test('with no active quest there is no target and the fallback text stays', (): void => {
  const world: World = worldIn(content, content.world.start, 1);
  for (const quest of content.quests.values()) world.quests[quest.id] = quest.objectives.length;
  assert.equal(objectiveTarget(world), null);
  assert.equal(nextAction(null, 'keep'), 'keep');
});

void test('a target in this zone shows the objective as written, and one past an exit names where to go', (): void => {
  const world: World = fresh(content.world.start);
  const person: ObjectiveTarget | null = objectiveTarget(world);
  assert.ok(person !== null);
  assert.equal(nextAction(person, 'Ask about the storm'), 'Ask about the storm');
  world.quests['errand'] = 1;
  const exit: ObjectiveTarget | null = objectiveTarget(world);
  assert.ok(exit !== null && exit.kind === 'exit');
  assert.equal(nextAction(exit, 'Reach the fire'), `Go to ${exit.name}`);
  assert.doesNotMatch(nextAction(exit, ''), /marked/);
});
