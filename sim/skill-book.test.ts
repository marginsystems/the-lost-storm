import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { SkillUnlock } from './content/shape-types.ts';
import type { Content } from './content/types.ts';
import { grantXp } from './world/character.ts';
import { placeLinks, xpToNextLevel } from './progression.ts';
import { parseSaveText, toSave } from './save.ts';
import { assignSlot, chartSkills, defaultBar, everySkill, placeLearned, placeOf, readBar, readLearned, startingSkills } from './skill-book.ts';
import { stepWorld } from './world/step.ts';
import type { World, WorldEvent } from './world/types.ts';

const content: Content = loadContent();

function levelTo(world: World, level: number): void {
  while (world.player.level < level) grantXp(world, xpToNextLevel(content.player.xp, world.player.level) - world.player.xp);
}

const TEACHES: Readonly<Record<string, readonly [string, string]>> = {
  out_of_the_mist: ['roll_taught', 'yes'],
  the_first_taker: ['first_moment', 'cleared'],
  wardens_lesson: ['fire_lesson', 'given'],
};

function finish(world: World, quest: string): WorldEvent[] {
  const [flag, value] = must(TEACHES[quest], quest);
  world.flags[flag] = value;
  return stepWorld(world, [], 1 / 60);
}

void test('the chart unlocks eight to ten active skills beyond the basic attack and the roll, one place each, each a different shape', (): void => {
  const offered: readonly string[] = chartSkills(content, content.skillTree.map((node): string => node.id));
  assert.ok(offered.length >= 8 && offered.length <= 10);
  assert.equal(new Set<string>(offered).size, offered.length);
  const shapes: Set<string> = new Set<string>(offered.map((id: string): string => {
    const skill = must(content.skills.get(id), id);
    const area: string = skill.delivery.type === 'area' ? `${skill.delivery.anchor}:${skill.delivery.pull > 0 ? 'pull' : ''}:${skill.delivery.pulse > 0 ? 'pulse' : ''}:${skill.delivery.slow < 1 ? 'slow' : ''}` : '';
    return `${skill.delivery.type}:${area}:${skill.press?.type ?? ''}:${skill.brand === null ? '' : 'brand'}`;
  }));
  assert.equal(shapes.size, offered.length);
});

void test('each path opens on an ability place, so a new character sees five abilities around the eye', (): void => {
  const entrances = content.skillTree.filter((node): boolean => node.requires.length === 0);
  assert.equal(entrances.length, content.chart.paths.length);
  for (const node of entrances) assert.ok(node.unlock !== null, node.id);
  assert.equal(new Set<string>(entrances.map((node): string => node.path)).size, content.chart.paths.length);
});

void test('a new hero wakes with nothing but the basic attack, and every other slot empty', (): void => {
  assert.deepEqual(startingSkills(content), ['cleave']);
  assert.deepEqual(defaultBar(content), ['cleave', null, null, null, null, null]);
  const world: World = worldIn(content, 'between', 3);
  assert.deepEqual(world.player.learned, ['cleave']);
  assert.deepEqual(world.player.skills.map((skill): string | null => skill?.id ?? null), ['cleave', null, null, null, null, null]);
  stepWorld(world, [{ type: 'slot', slot: 1, skill: 'thunderclap' }], 1 / 60);
  assert.equal(world.player.bar[1], null);
});

void test('levels give points but never a skill; a skill is learned only by taking its place', (): void => {
  const world: World = worldIn(content, 'between', 3);
  levelTo(world, 3);
  stepWorld(world, [], 1 / 60);
  assert.deepEqual(world.player.learned, ['cleave']);
  assert.equal(world.player.skillPoints, 2 * content.chart.pointsPerLevel);
});

void test('the roll is taught by play; the first moment and the lesson each grant a chart point, a place turns a point into a skill on the bar, and the next point must join it', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 3);
  const roll: WorldEvent[] = finish(world, 'out_of_the_mist');
  assert.deepEqual(roll.filter((event: WorldEvent): boolean => event.type === 'skill_unlocked'), [{ type: 'skill_unlocked', skill: 'dodge_roll', slot: 5 }]);
  const moment: WorldEvent[] = finish(world, 'the_first_taker');
  assert.deepEqual(moment.filter((event: WorldEvent): boolean => event.type === 'chart_point'), [{ type: 'chart_point', source: 'first_moment', points: 1 }]);
  assert.deepEqual(world.player.learned, ['cleave', 'dodge_roll']);
  assert.equal(world.player.skillPoints, 1);
  assert.equal(finish(world, 'the_first_taker').filter((event: WorldEvent): boolean => event.type === 'chart_point').length, 0);
  const bolt = must(placeOf(content, 'storm_bolt'), 'bolt place');
  const taken: WorldEvent[] = stepWorld(world, [{ type: 'allocate', node: bolt.id }], 1 / 60);
  assert.deepEqual(taken.filter((event: WorldEvent): boolean => event.type === 'skill_unlocked'), [{ type: 'skill_unlocked', skill: 'storm_bolt', slot: 1 }]);
  assert.equal(world.player.skills[1]?.id, 'storm_bolt');
  finish(world, 'wardens_lesson');
  assert.equal(world.player.skillPoints, 1);
  const clap = must(placeOf(content, 'thunderclap'), 'clap place');
  stepWorld(world, [{ type: 'allocate', node: clap.id }], 1 / 60);
  assert.ok(!world.player.learned.includes('thunderclap'));
  assert.equal(world.player.skillPoints, 1);
  const next: string = must(placeLinks(content).get(bolt.id)?.[0], 'place beside the bolt');
  stepWorld(world, [{ type: 'allocate', node: next }], 1 / 60);
  assert.ok(world.player.allocated.includes(next));
  assert.equal(world.player.skillPoints, 0);
});

void test('giving a place back forgets its skill and clears it from the bar', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 3);
  world.player.skillPoints = 1;
  world.player.gold = 1000;
  const bolt = must(placeOf(content, 'storm_bolt'), 'bolt place');
  stepWorld(world, [{ type: 'allocate', node: bolt.id }], 1 / 60);
  assert.ok(world.player.learned.includes('storm_bolt'));
  stepWorld(world, [{ type: 'refund', node: bolt.id }], 1 / 60);
  assert.ok(!world.player.learned.includes('storm_bolt'));
  assert.ok(!world.player.bar.includes('storm_bolt'));
  assert.equal(world.player.skillPoints, 1);
});

void test('every skill a place unlocks can be placed from the slot picker list', (): void => {
  const listed: readonly string[] = everySkill(content).map((entry: SkillUnlock): string => entry.skill);
  for (const skill of chartSkills(content, content.skillTree.map((node): string => node.id))) assert.ok(listed.includes(skill), skill);
  assert.equal(new Set<string>(listed).size, listed.length);
});

void test('the slice reaches each lesson through a quest step that sets the flag its point waits for', (): void => {
  for (const [questId, [flag, value]] of Object.entries(TEACHES)) {
    const quest = must(content.quests.get(questId), questId);
    assert.ok(quest.objectives.some((objective): boolean => objective.sets[flag] === value), `${questId} sets ${flag}`);
  }
  const taker = must(must(content.quests.get('the_first_taker'), 'quest').objectives[0], 'objective');
  assert.equal(taker.type, 'moment');
});

void test('a skill is placed in a slot, placing one already on the bar swaps the two, and a broken slot changes nothing', (): void => {
  const bar = ['cleave', 'thunderclap', 'storm_bolt', null, null, 'dodge_roll'];
  assert.deepEqual(assignSlot(bar, 3, 'forkline'), ['cleave', 'thunderclap', 'storm_bolt', 'forkline', null, 'dodge_roll']);
  assert.deepEqual(assignSlot(bar, 1, 'storm_bolt'), ['cleave', 'storm_bolt', 'thunderclap', null, null, 'dodge_roll']);
  assert.deepEqual(assignSlot(bar, 4, 'cleave'), [null, 'thunderclap', 'storm_bolt', null, 'cleave', 'dodge_roll']);
  assert.deepEqual(assignSlot(bar, 9, 'cleave'), bar);
  assert.deepEqual(assignSlot(bar, Number.NaN, 'cleave'), bar);
  assert.deepEqual(assignSlot(bar, 1.5, 'cleave'), bar);
});

void test('a learned skill goes home when its slot is free and to the first free slot when it is not', (): void => {
  assert.deepEqual(placeLearned(content, ['cleave', null, null, null, null, null], 'dodge_roll'), ['cleave', null, null, null, null, 'dodge_roll']);
  assert.deepEqual(placeLearned(content, ['cleave', 'forkline', null, null, null, null], 'thunderclap'), ['cleave', 'forkline', 'thunderclap', null, null, null]);
  assert.deepEqual(placeLearned(content, ['cleave', 'a', 'b', 'c', 'd', 'e'], 'thunderclap'), ['cleave', 'a', 'b', 'c', 'd', 'e']);
});

void test('the slot command places only learned skills, and the bar, the places and the points granted survive a save', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 3);
  finish(world, 'out_of_the_mist');
  finish(world, 'the_first_taker');
  stepWorld(world, [{ type: 'allocate', node: must(placeOf(content, 'thunderclap'), 'clap').id }], 1 / 60);
  stepWorld(world, [{ type: 'slot', slot: 4, skill: 'thunderclap' }], 1 / 60);
  assert.equal(world.player.bar[4], 'thunderclap');
  stepWorld(world, [{ type: 'slot', slot: 3, skill: 'held_breath' }], 1 / 60);
  assert.equal(world.player.bar[3], null);
  const saved = must(parseSaveText(content, JSON.stringify(toSave(world))), 'save');
  assert.deepEqual(saved.bar, world.player.bar);
  assert.deepEqual(saved.learned, world.player.learned);
  assert.deepEqual(saved.grants, ['first_moment']);
});

void test('no save brings back a skill without its place: an old kit on the bar or in the learned list is dropped', (): void => {
  const learned: string[] = readLearned(content, ['cleave', 'thunderclap', 'storm_bolt', 'dodge_roll'], []);
  assert.deepEqual(learned, ['cleave', 'dodge_roll']);
  assert.deepEqual(readLearned(content, undefined, []), ['cleave']);
  assert.deepEqual(readLearned(content, undefined, [must(placeOf(content, 'forkline'), 'fork').id]), ['cleave', 'forkline']);
  assert.deepEqual(readBar(content, ['cleave', 'thunderclap', 'storm_bolt', null, null, 'dodge_roll'], learned), ['cleave', null, null, null, null, 'dodge_roll']);
  assert.deepEqual(readBar(content, ['held_breath', 'cleave', 'cleave', 42, null, 'nonsense'], learned), [null, 'cleave', null, null, null, null]);
});
