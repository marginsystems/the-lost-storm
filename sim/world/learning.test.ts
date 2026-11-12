import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arena, ARENA_CENTRE, place } from '../../test/arena-support.ts';
import { must, worldIn, zoneOf } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { readSave, toSave } from '../save.ts';
import { createWorld } from './create.ts';
import { enterZone } from './zones.ts';
import { chooseSkill, learnSkills, pendingOffer } from './learning.ts';
import { refreshPlayer } from './character.ts';
import { stepWorld } from './step.ts';
import type { Command, MonsterState, World } from './types.ts';

const content: Content = loadContent();

const FIGHT = {
  dt: 1 / 30,
  limit: 90,
  flaskAt: 0.45,
  seeds: [1, 2, 3, 4, 5],
} as const;

function bare(seed: number): World {
  const world: World = arena(seed);
  world.player.learned = ['cleave'];
  world.player.bar = ['cleave', null, null, null, null, null];
  refreshPlayer(world);
  world.player.life = world.player.maxLife;
  world.events = [];
  return world;
}

function swing(world: World): Command[] {
  const foes: MonsterState[] = world.monsters.filter((monster: MonsterState): boolean => monster.alive);
  const from = world.player.pos;
  const target: MonsterState | undefined = foes.toSorted((a: MonsterState, b: MonsterState): number => Math.hypot(a.pos.x - from.x, a.pos.z - from.z) - Math.hypot(b.pos.x - from.x, b.pos.z - from.z))[0];
  if (target === undefined) return [];
  const commands: Command[] = [];
  if (world.player.life < world.player.maxLife * FIGHT.flaskAt) commands.push({ type: 'flask', slot: 0 });
  commands.push({ type: 'skill', slot: 0, aim: target.pos, targetId: target.id });
  return commands;
}

function fight(world: World): { readonly cleared: boolean; readonly alive: boolean; readonly lifeLeft: number } {
  let time: number = 0;
  while (time < FIGHT.limit && world.player.alive && world.monsters.some((monster: MonsterState): boolean => monster.alive)) {
    stepWorld(world, swing(world), FIGHT.dt);
    time += FIGHT.dt;
  }
  return { cleared: !world.monsters.some((monster: MonsterState): boolean => monster.alive), alive: world.player.alive, lifeLeft: world.player.life / world.player.maxLife };
}

void test('with only the basic attack, a fresh hero wins the first fights of the road and lives', (): void => {
  for (const seed of FIGHT.seeds) {
    const pair: World = bare(seed);
    place(pair, 'mended', { x: ARENA_CENTRE.x + 5, z: ARENA_CENTRE.z });
    place(pair, 'mended', { x: ARENA_CENTRE.x + 6, z: ARENA_CENTRE.z + 1.5 });
    const first = fight(pair);
    assert.ok(first.cleared && first.alive, `seed ${seed}: two mended`);
    const taker: World = bare(seed);
    place(taker, 'mended', { x: ARENA_CENTRE.x + 5, z: ARENA_CENTRE.z });
    place(taker, 'mended', { x: ARENA_CENTRE.x + 5, z: ARENA_CENTRE.z + 2 });
    place(taker, 'unfinished_taker', { x: ARENA_CENTRE.x + 7, z: ARENA_CENTRE.z + 1 });
    const second = fight(taker);
    assert.ok(second.cleared && second.alive, `seed ${seed}: the Taker's pack`);
  }
});

void test('a skill whose flag is written is learned on the next step, once, with its event', (): void => {
  const world: World = bare(1);
  learnSkills(world);
  assert.deepEqual(world.player.learned, ['cleave']);
  world.flags['roll_taught'] = 'yes';
  const events = stepWorld(world, [], FIGHT.dt);
  assert.deepEqual(events.filter((event): boolean => event.type === 'skill_unlocked'), [{ type: 'skill_unlocked', skill: 'dodge_roll', slot: 5, chosen: false }]);
  const again = stepWorld(world, [], FIGHT.dt);
  assert.equal(again.filter((event): boolean => event.type === 'skill_unlocked').length, 0);
  assert.equal(world.player.skills[5]?.id, 'dodge_roll');
});

void test('a skill picked from an offer is marked chosen, and one the story grants is not', (): void => {
  const world: World = bare(1);
  learnSkills(world);
  world.flags['first_moment'] = 'cleared';
  const open = pendingOffer(world);
  assert.ok(open !== null, 'the first offer is open');
  const pick: string | undefined = open.choices[0];
  assert.ok(pick !== undefined, 'the offer has a choice');
  world.events.length = 0;
  chooseSkill(world, open.offer.id, pick);
  assert.deepEqual(world.events.filter((event): boolean => event.type === 'skill_unlocked').map((event): boolean => event.type === 'skill_unlocked' && event.chosen), [true]);
});

void test('a choice left waiting is still waiting after a zone change and after a save is loaded', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 3);
  world.flags['first_moment'] = 'cleared';
  const waiting: string | undefined = pendingOffer(world)?.offer.id;
  assert.equal(waiting, 'first_moment');
  enterZone(world, zoneOf(content, 'between'), { type: 'start' });
  assert.equal(pendingOffer(world)?.offer.id, waiting);
  const loaded: World = createWorld(content, { seed: 4, save: must(readSave(content, JSON.parse(JSON.stringify(toSave(world)))), 'save') });
  assert.equal(pendingOffer(loaded)?.offer.id, waiting);
  assert.deepEqual(pendingOffer(loaded)?.choices, pendingOffer(world)?.choices);
});

void test('two offers open at once wait in line: only the first is offered, and the second comes once it is chosen', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 5);
  world.flags['first_moment'] = 'cleared';
  world.flags['fire_lesson'] = 'given';
  const first = must(pendingOffer(world), 'first offer');
  assert.equal(first.offer.id, 'first_moment');
  chooseSkill(world, first.offer.id, must(first.choices[0], 'choice'));
  const second = must(pendingOffer(world), 'second offer');
  assert.equal(second.offer.id, 'fire_lesson');
  assert.ok(!second.choices.includes(must(first.choices[0], 'choice')));
});
