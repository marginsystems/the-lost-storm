import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, arena, place } from '../test/arena-support.ts';
import { finishQuests, must } from '../test/support.ts';
import { botInDanger, botPlay, botRoute, botTalk, botTravelTo, botWalkTo, createBot } from './bot.ts';
import type { Bot, BotReport } from './bot.ts';
import { loadContent } from './content/content.ts';
import type { Content, SkillDef } from './content/types.ts';
import { offenceOf } from './world/combat.ts';
import { createWorld } from './world/create.ts';
import { placeHazard } from './world/hazards.ts';
import { startSkill } from './world/skills.ts';
import type { MonsterState, World } from './world/types.ts';

const content: Content = loadContent();

const ACT = {
  seeds: [11, 12, 13],
  minMinutes: 5,
  maxMinutes: 12,
  minLevel: 6,
  maxLevel: 9,
  maxDeaths: 1,
  optionalZone: 'drowned_bastion',
} as const;

void test('the bot plays the whole act from a fresh save: every quest, in the time and at the level it is tuned for, never needing the optional zone', (): void => {
  const needed: string[] = [...content.zones.keys()].filter((zone: string): boolean => zone !== ACT.optionalZone).toSorted();
  for (const seed of ACT.seeds) {
    const world: World = createWorld(content, { seed, save: null });
    const report: BotReport = botPlay(createBot(world));
    const minutes: number = report.seconds / 60;
    assert.equal(report.stuck, null, `seed ${seed}`);
    assert.deepEqual(report.completed.toSorted(), [...content.quests.keys()].toSorted(), `seed ${seed}`);
    assert.ok(minutes >= ACT.minMinutes && minutes <= ACT.maxMinutes, `seed ${seed} took ${minutes.toFixed(1)} minutes`);
    assert.ok(world.player.level >= ACT.minLevel && world.player.level <= ACT.maxLevel, `seed ${seed} ended at level ${world.player.level}`);
    assert.ok(report.deaths <= ACT.maxDeaths, `seed ${seed} died ${report.deaths} times`);
    assert.deepEqual(world.visited.toSorted(), needed, `seed ${seed}`);
  }
});

void test('the bot walks, talks and travels between zones', (): void => {
  const world: World = finishQuests(createWorld(content, { seed: 12, save: null }));
  const bot: Bot = createBot(world);
  assert.equal(botWalkTo(bot, 'stillhold', { x: 30, z: 20 }, 0.6), true);
  assert.equal(botTalk(bot, 'maren'), true);
  assert.equal(world.dialogue, null);
  assert.equal(botTalk(bot, 'nobody'), false);
  assert.deepEqual(botRoute(world, 'drowned_bastion')?.map((exit): string => exit.id), ['bastion_stair']);
  assert.equal(botRoute(world, 'nowhere'), null);
  assert.equal(botTravelTo(bot, 'drowned_bastion'), true);
  assert.equal(world.zone.id, 'drowned_bastion');
  assert.equal(botTravelTo(bot, 'stillhold'), true);
  assert.equal(world.zone.id, 'stillhold');
});

void test('the bot will not route through an exit that is still locked', (): void => {
  const world: World = createWorld(content, { seed: 13, save: null });
  assert.equal(botRoute(world, 'drowned_bastion'), null);
  assert.equal(botTravelTo(createBot(world), 'drowned_bastion'), false);
  assert.equal(world.zone.id, 'stillhold');
});

void test('the bot reads a live mark on the ground and the landing spot of a leap as danger', (): void => {
  const world: World = arena(21);
  const caller: MonsterState = place(world, 'test_caller', { x: ARENA_CENTRE.x + 8, z: ARENA_CENTRE.z });
  const mark: SkillDef = must(world.content.skills.get('test_mark'), 'mark');
  startSkill(world, caller, mark, { x: ARENA_CENTRE.x - caller.pos.x, z: ARENA_CENTRE.z - caller.pos.z });
  assert.equal(botInDanger(world, ARENA_CENTRE), true);
  assert.equal(botInDanger(world, { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z - 6 }), false);
  caller.action = null;
  placeHazard(world, offenceOf(caller), mark, ARENA_CENTRE);
  assert.equal(botInDanger(world, ARENA_CENTRE), true);
  assert.equal(botInDanger(world, { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z - 6 }), false);
  world.hazards = [];
  const ghoul: MonsterState = place(world, 'test_ghoul', { x: ARENA_CENTRE.x - 8, z: ARENA_CENTRE.z });
  startSkill(world, ghoul, must(world.content.skills.get('test_pounce'), 'pounce'), { x: 8, z: 0 });
  assert.equal(botInDanger(world, { x: ARENA_CENTRE.x - 0.8, z: ARENA_CENTRE.z }), true);
  assert.equal(botInDanger(world, { x: ARENA_CENTRE.x - 7, z: ARENA_CENTRE.z + 4 }), false);
});
