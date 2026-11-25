import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn, zoneOf } from '../../test/support.ts';
import { TOWN_CONTENT } from '../../test/town-support.ts';
import { loadContent } from '../content/content.ts';
import { inSentence } from '../name-text.ts';
import type { Content, ObjectiveDef, QuestDef, ZoneExit } from '../content/types.ts';
import { moveExit } from './exits.ts';
import { createFrameTargets, nextAction, objectiveTarget, questTarget, writtenLine } from './objective.ts';
import type { FrameTargets, ObjectiveTarget } from './objective.ts';
import { activeQuests, currentObjective, startQuests } from './quests.ts';
import { enterZone } from './zones.ts';
import { MAX_STEP as STEP, stepWorld } from './step.ts';
import type { World } from './types.ts';

const errand: QuestDef = {
  id: 'errand',
  name: 'An Errand',
  requires: [],
  when: [],
  objectives: [
    { id: 'ask', type: 'talk', npc: 'keeper', talk: null, text: 'Ask', waiting: '', when: [], sets: {}, gift: null },
    { id: 'go', type: 'reach', zone: 'outpost', x: 28, z: 30, radius: 2, text: 'Go', waiting: '', when: [], sets: {}, gift: null },
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

void test('an exit moved in this zone moves the target with it', (): void => {
  const world: World = fresh(content.world.start);
  world.quests['errand'] = 1;
  const exit: ZoneExit | undefined = world.zone.exits.find((candidate: ZoneExit): boolean => candidate.to === 'outpost');
  assert.ok(exit !== undefined);
  moveExit(world, exit.id, { x: exit.x + 40, z: exit.z - 25 });
  const target: ObjectiveTarget | null = objectiveTarget(world);
  assert.deepEqual(target?.pos, { x: exit.x + 40, z: exit.z - 25 });
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
  assert.equal(nextAction(exit, 'Reach the fire'), `Go to ${inSentence(exit.name)}`);
  assert.doesNotMatch(nextAction(exit, ''), /marked/);
});

void test('an objective still locked shows its waiting line, and once open the line names where to go and then what to defeat, from the data', (): void => {
  const shipped: Content = loadContent();
  const gate: QuestDef = must([...shipped.quests.values()].find((quest: QuestDef): boolean => quest.objectives.some((objective: ObjectiveDef): boolean => objective.waiting !== '' && objective.type === 'defeat')), 'a quest with a waiting defeat objective');
  const step: ObjectiveDef = must(gate.objectives.find((objective: ObjectiveDef): boolean => objective.waiting !== ''), 'the waiting objective');
  assert.equal(step.type, 'defeat');
  const lair: string = must([...shipped.zones.values()].find((zone): boolean => zone.packs.some((pack): boolean => pack.members.some((member): boolean => member.monster === step.monster))), 'the lair').id;
  const hall: string = must([...shipped.zones.values()].find((zone): boolean => zone.exits.some((exit: ZoneExit): boolean => exit.to === lair)), 'the zone before the lair').id;
  const world: World = worldIn(shipped, hall, 1);
  for (const quest of shipped.quests.values()) world.quests[quest.id] = quest.id === gate.id ? gate.objectives.indexOf(step) : quest.objectives.length;
  const line = (): string => nextAction(questTarget(world, gate), writtenLine(world, must(currentObjective(world, gate), 'the gate step')));
  world.player.level = 1;
  assert.equal(line(), step.waiting);
  world.player.level = 20;
  assert.equal(line(), `Go to ${inSentence(zoneOf(shipped, lair).name)}`);
  enterZone(world, zoneOf(shipped, lair), { type: 'start' });
  assert.equal(line(), `Defeat ${inSentence(must(shipped.monsters.get(step.monster), 'the boss').name)}`);
  world.quests[gate.id] = gate.objectives.length;
  assert.ok(!activeQuests(world).includes(gate));
});

void test('an objective with no waiting line keeps its written text while locked', (): void => {
  const world: World = fresh(content.world.start);
  const locked: ObjectiveDef = { id: 'later', type: 'talk', npc: 'keeper', talk: null, text: 'Ask later', waiting: '', when: [{ type: 'level', atLeast: 99, not: false }], sets: {}, gift: null };
  assert.equal(writtenLine(world, locked), 'Ask later');
  assert.equal(writtenLine(world, { ...locked, waiting: 'Not yet' }), 'Not yet');
  assert.equal(writtenLine(world, { ...locked, when: [], waiting: 'Not yet' }), 'Ask later');
});

void test('frame targets give the live target and keep it within a step until renewed, then follow the world after the next step', (): void => {
  const world: World = fresh(content.world.start);
  const targets: FrameTargets = createFrameTargets();
  const first: ObjectiveTarget | null = targets.objective(world);
  assert.deepEqual(first, objectiveTarget(world));
  assert.equal(targets.objective(world), first);
  assert.equal(targets.quest(world, errand), first);
  world.quests['errand'] = 1;
  assert.equal(targets.objective(world), first);
  targets.renew();
  const next: ObjectiveTarget | null = targets.objective(world);
  assert.deepEqual(next, objectiveTarget(world));
  assert.deepEqual(targets.quest(world, errand), questTarget(world, errand));
  assert.equal(next?.kind, 'exit');
  world.quests['errand'] = 0;
  assert.equal(targets.objective(world), next);
  stepWorld(world, [], STEP);
  assert.deepEqual(targets.objective(world), objectiveTarget(world));
  assert.equal(targets.objective(world)?.kind, 'person');
  const other: World = fresh(content.world.start);
  assert.deepEqual(targets.objective(other), objectiveTarget(other));
  assert.equal(targets.objective(other)?.kind, 'person');
});
