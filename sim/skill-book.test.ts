import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { SkillUnlock } from './content/shape-types.ts';
import type { Content } from './content/types.ts';
import { grantXp } from './world/character.ts';
import { xpToNextLevel } from './progression.ts';
import { parseSaveText, toSave } from './save.ts';
import { assignSlot, defaultBar, everySkill, placeLearned, readBar, readLearned, readTaken, startingSkills, unlockedSkills } from './skill-book.ts';
import { pendingOffer } from './world/learning.ts';
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

void test('the hero can earn eight to ten active skills across the first act, beyond the basic attack and the roll, each a different shape', (): void => {
  const offered: readonly string[] = unlockedSkills(content, 7).filter((skill: string): boolean => skill !== 'cleave' && skill !== 'dodge_roll');
  assert.ok(offered.length >= 8 && offered.length <= 10);
  const shapes: Set<string> = new Set<string>(offered.map((id: string): string => {
    const skill = must(content.skills.get(id), id);
    const area: string = skill.delivery.type === 'area' ? `${skill.delivery.anchor}:${skill.delivery.pull > 0 ? 'pull' : ''}:${skill.delivery.pulse > 0 ? 'pulse' : ''}:${skill.delivery.slow < 1 ? 'slow' : ''}` : '';
    return `${skill.delivery.type}:${area}:${skill.press?.type ?? ''}:${skill.brand === null ? '' : 'brand'}`;
  }));
  assert.equal(shapes.size, offered.length);
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

void test('levels alone offer nothing before the road has taught the first skills', (): void => {
  const world: World = worldIn(content, 'between', 3);
  levelTo(world, 7);
  stepWorld(world, [], 1 / 60);
  assert.deepEqual(world.player.learned, ['cleave']);
  assert.equal(pendingOffer(world), null);
});

void test('the roll is taught outright; every other skill is chosen from an offer, never granted silently', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 3);
  const roll: WorldEvent[] = finish(world, 'out_of_the_mist');
  assert.deepEqual(roll.filter((event: WorldEvent): boolean => event.type === 'skill_unlocked'), [{ type: 'skill_unlocked', skill: 'dodge_roll', slot: 5 }]);
  finish(world, 'the_first_taker');
  assert.deepEqual(world.player.learned, ['cleave', 'dodge_roll']);
  const first = must(pendingOffer(world), 'first offer');
  assert.deepEqual(first.choices, ['thunderclap', 'storm_bolt', 'forkline']);
  stepWorld(world, [{ type: 'choose', offer: first.offer.id, skill: 'held_breath' }], 1 / 60);
  stepWorld(world, [{ type: 'choose', offer: 'fire_lesson', skill: 'thunderclap' }], 1 / 60);
  assert.deepEqual(world.player.learned, ['cleave', 'dodge_roll']);
  stepWorld(world, [{ type: 'choose', offer: first.offer.id, skill: 'forkline' }], 1 / 60);
  assert.equal(world.player.bar[1], 'forkline');
  assert.equal(pendingOffer(world), null);
  finish(world, 'wardens_lesson');
  const fire = must(pendingOffer(world), 'fire offer');
  assert.deepEqual(fire.choices, ['storm_bolt', 'thunderclap', 'mist_step']);
  stepWorld(world, [{ type: 'choose', offer: fire.offer.id, skill: 'storm_bolt' }], 1 / 60);
  assert.equal(world.player.bar[2], 'storm_bolt');
  levelTo(world, 2);
  const second = must(pendingOffer(world), 'second offer');
  assert.ok(!second.choices.includes('forkline'));
  assert.ok(second.choices.includes('mist_step'));
});

void test('every offered skill can be placed from the slot picker list', (): void => {
  const listed: readonly string[] = everySkill(content).map((entry: SkillUnlock): string => entry.skill);
  for (const offer of content.player.skillOffers) for (const skill of offer.choices) assert.ok(listed.includes(skill), skill);
  assert.equal(new Set<string>(listed).size, listed.length);
});

void test('a skill passed over comes round again in a later offer', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 3);
  world.flags['first_moment'] = 'cleared';
  world.flags['fire_lesson'] = 'given';
  stepWorld(world, [{ type: 'choose', offer: 'first_moment', skill: 'storm_bolt' }], 1 / 60);
  const next = must(pendingOffer(world), 'fire');
  assert.equal(next.offer.id, 'fire_lesson');
  assert.ok(next.choices.includes('thunderclap'));
});

void test('the slice reaches each lesson through a quest step that sets the flag its offer waits for', (): void => {
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

void test('the slot command places only learned skills, and the bar and what was learned survive a save', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 3);
  finish(world, 'out_of_the_mist');
  finish(world, 'the_first_taker');
  stepWorld(world, [{ type: 'choose', offer: 'first_moment', skill: 'thunderclap' }], 1 / 60);
  const swap: Command[] = [{ type: 'slot', slot: 4, skill: 'thunderclap' }];
  stepWorld(world, swap, 1 / 60);
  assert.equal(world.player.bar[4], 'thunderclap');
  const saved = must(parseSaveText(content, JSON.stringify(toSave(world))), 'save');
  assert.deepEqual(saved.bar, world.player.bar);
  assert.deepEqual(saved.learned, world.player.learned);
  assert.deepEqual(saved.offers, ['first_moment']);
  assert.deepEqual(readTaken(content, undefined, ['cleave', 'thunderclap']), ['first_moment']);
  assert.deepEqual(readTaken(content, undefined, ['cleave', 'thunderclap', 'storm_bolt']), ['first_moment', 'fire_lesson']);
});

void test('an offer whose own skills are all learned still opens with skills passed over before', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 3);
  levelTo(world, 7);
  finish(world, 'out_of_the_mist');
  finish(world, 'the_first_taker');
  finish(world, 'wardens_lesson');
  const picks: readonly string[] = ['thunderclap', 'storm_bolt', 'mist_step', 'downdraught', 'static_brand', 'living_wire', 'held_breath'];
  for (const skill of picks) {
    const open = must(pendingOffer(world), skill);
    assert.ok(open.choices.includes(skill), `${open.offer.id} offers ${skill}`);
    stepWorld(world, [{ type: 'choose', offer: open.offer.id, skill }], 1 / 60);
  }
  const last = must(pendingOffer(world), 'seventh wind');
  assert.equal(last.offer.id, 'seventh_wind');
  assert.ok(last.choices.length >= 2);
  assert.ok(last.choices.every((skill: string): boolean => !world.player.learned.includes(skill)));
});

void test('an offer whose own skills are mostly learned is topped up with skills passed over before', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 3);
  levelTo(world, 7);
  finish(world, 'out_of_the_mist');
  finish(world, 'the_first_taker');
  finish(world, 'wardens_lesson');
  const picks: Readonly<Record<string, string>> = { fifth_wind: 'living_wire', sixth_wind: 'squall' };
  for (let guard = 0; guard < 10; guard += 1) {
    const open = pendingOffer(world);
    if (open === null || open.offer.id === 'seventh_wind') break;
    const skill: string = picks[open.offer.id] ?? must(open.choices.find((id: string): boolean => id !== 'held_breath' && id !== 'living_wire' && id !== 'squall'), open.offer.id);
    stepWorld(world, [{ type: 'choose', offer: open.offer.id, skill }], 1 / 60);
  }
  const last = must(pendingOffer(world), 'seventh wind');
  assert.equal(last.offer.id, 'seventh_wind');
  assert.equal(last.choices.length, 2);
  assert.equal(last.choices[0], 'held_breath');
  assert.ok(!world.player.learned.includes(last.choices[1] ?? 'cleave'));
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
