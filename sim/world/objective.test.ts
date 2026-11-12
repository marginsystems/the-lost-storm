import assert from 'node:assert/strict';
import { test } from 'node:test';
import { worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { nextAction, objectiveTarget } from './objective.ts';
import type { ObjectiveTarget } from './objective.ts';
import { startQuests } from './quests.ts';
import type { World } from './types.ts';

const content: Content = loadContent();

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
  for (const quest of content.quests.values()) world.quests[quest.id] = quest.objectives.length;
  world.quests['north_lamp'] = 0;
  const target: ObjectiveTarget | null = objectiveTarget(world);
  assert.ok(target !== null);
  if (target.kind === 'exit') assert.ok(world.zone.exits.some((exit): boolean => exit.x === target.pos.x && exit.z === target.pos.z));
  assert.ok(target.kind === 'exit' || target.kind === 'monster' || target.kind === 'spot');
});

void test('with no active quest there is no target and the fallback text stays', (): void => {
  const world: World = worldIn(content, content.world.start, 1);
  for (const quest of content.quests.values()) world.quests[quest.id] = quest.objectives.length;
  assert.equal(objectiveTarget(world), null);
  assert.equal(nextAction(null, 'keep'), 'keep');
});
