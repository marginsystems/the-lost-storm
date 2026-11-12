import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { SkillUnlock } from './content/shape-types.ts';
import type { Content } from './content/types.ts';
import { grantXp } from './world/character.ts';
import { xpToNextLevel } from './progression.ts';
import { parseSaveText, toSave } from './save.ts';
import { assignSlot, defaultBar, placeLearned, readBar, readLearned, startingSkills } from './skill-book.ts';
import { stepWorld } from './world/step.ts';
import type { Command, World, WorldEvent } from './world/types.ts';

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

void test('the hero learns eight to ten active skills across the first act, beyond the basic attack and the roll', (): void => {
  const learned: readonly SkillUnlock[] = content.player.skillBook.filter((entry: SkillUnlock): boolean => entry.skill !== 'cleave' && entry.skill !== 'dodge_roll');
  assert.ok(learned.length >= 8 && learned.length <= 10);
  assert.ok(learned.every((entry: SkillUnlock): boolean => entry.level <= 7));
  const shapes: Set<string> = new Set<string>(learned.map((entry: SkillUnlock): string => {
    const skill = must(content.skills.get(entry.skill), entry.skill);
    const area: string = skill.delivery.type === 'area' ? `${skill.delivery.anchor}:${skill.delivery.pull > 0 ? 'pull' : ''}:${skill.delivery.pulse > 0 ? 'pulse' : ''}:${skill.delivery.slow < 1 ? 'slow' : ''}` : '';
    return `${skill.delivery.type}:${area}:${skill.press?.type ?? ''}:${skill.brand === null ? '' : 'brand'}`;
  }));
  assert.equal(shapes.size, learned.length);
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

void test('levels alone teach nothing before the road has taught the first skills', (): void => {
  const world: World = worldIn(content, 'between', 3);
  levelTo(world, 7);
  stepWorld(world, [], 1 / 60);
  assert.deepEqual(world.player.learned, ['cleave']);
});

void test('the roll comes with the Shallows, the first skill with the first Taker, the second from the Warden, and each lands in its home slot', (): void => {
  const world: World = worldIn(content, 'between', 3);
  const roll: WorldEvent[] = finish(world, 'out_of_the_mist');
  assert.deepEqual(roll.filter((event: WorldEvent): boolean => event.type === 'skill_unlocked'), [{ type: 'skill_unlocked', skill: 'dodge_roll', slot: 5 }]);
  finish(world, 'the_first_taker');
  assert.equal(world.player.bar[1], 'thunderclap');
  finish(world, 'wardens_lesson');
  assert.equal(world.player.bar[2], 'storm_bolt');
  assert.equal(world.player.skills[2]?.id, 'storm_bolt');
  assert.deepEqual(world.player.learned, ['cleave', 'dodge_roll', 'thunderclap', 'storm_bolt']);
  levelTo(world, 3);
  stepWorld(world, [], 1 / 60);
  assert.ok(['forkline', 'mist_step', 'downdraught', 'thunderhead'].every((skill: string): boolean => world.player.learned.includes(skill)));
  assert.ok(!world.player.bar.includes(null));
});

void test('the slice teaches each skill through a quest step that sets the flag the skill book waits for', (): void => {
  for (const [questId, [flag, value]] of Object.entries(TEACHES)) {
    const quest = must(content.quests.get(questId), questId);
    assert.ok(quest.objectives.some((objective): boolean => objective.sets[flag] === value), `${questId} sets ${flag}`);
  }
  const taker = must(must(content.quests.get('the_first_taker'), 'quest').objectives[0], 'objective');
  assert.ok(taker.type === 'defeat' && taker.monster === 'unfinished_taker');
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

void test('the slot command places only learned skills, and the bar and what was learned survive a save', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 3);
  finish(world, 'out_of_the_mist');
  finish(world, 'the_first_taker');
  const swap: Command[] = [{ type: 'slot', slot: 4, skill: 'thunderclap' }];
  stepWorld(world, swap, 1 / 60);
  assert.equal(world.player.bar[4], 'thunderclap');
  const saved = must(parseSaveText(content, JSON.stringify(toSave(world))), 'save');
  assert.deepEqual(saved.bar, world.player.bar);
  assert.deepEqual(saved.learned, world.player.learned);
});

void test('a save from before skills were earned keeps every skill its level knew and everything on its bar', (): void => {
  const learned: string[] = readLearned(content, undefined, 3, ['cleave', 'thunderclap', 'storm_bolt', null, null, 'dodge_roll'].filter((skill): skill is string => skill !== null));
  assert.ok(['cleave', 'dodge_roll', 'thunderclap', 'storm_bolt', 'forkline', 'mist_step', 'downdraught', 'thunderhead'].every((skill: string): boolean => learned.includes(skill)));
  assert.ok(!learned.includes('held_breath'));
  const bar = readBar(content, undefined, learned);
  assert.equal(bar[0], 'cleave');
  assert.equal(bar[5], 'dodge_roll');
  assert.ok(bar.includes('forkline'));
  assert.deepEqual(readBar(content, ['held_breath', 'cleave', 'cleave', 42, null, 'nonsense'], learned), [null, 'cleave', null, null, null, null]);
  assert.deepEqual(readLearned(content, ['thunderclap', 'nonsense', 7], 1, []), ['cleave', 'thunderclap']);
});
