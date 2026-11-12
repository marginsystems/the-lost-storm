import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arena, ARENA_CENTRE, place } from '../../test/arena-support.ts';
import { grantPoints, learnSkills } from './learning.ts';
import { refreshPlayer } from './character.ts';
import { stepWorld } from './step.ts';
import type { Command, MonsterState, World } from './types.ts';

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
  assert.deepEqual(events.filter((event): boolean => event.type === 'skill_unlocked'), [{ type: 'skill_unlocked', skill: 'dodge_roll', slot: 5 }]);
  const again = stepWorld(world, [], FIGHT.dt);
  assert.equal(again.filter((event): boolean => event.type === 'skill_unlocked').length, 0);
  assert.equal(world.player.skills[5]?.id, 'dodge_roll');
});

void test('a point grant pays once when its flag is written, with its event, and never again', (): void => {
  const world: World = bare(1);
  const before: number = world.player.skillPoints;
  grantPoints(world);
  assert.equal(world.player.skillPoints, before);
  world.flags['first_moment'] = 'cleared';
  const events = stepWorld(world, [], FIGHT.dt);
  assert.deepEqual(events.filter((event): boolean => event.type === 'chart_point'), [{ type: 'chart_point', source: 'first_moment', points: 1 }]);
  assert.equal(world.player.skillPoints, before + 1);
  assert.deepEqual(world.player.grantsTaken, ['first_moment']);
  stepWorld(world, [], FIGHT.dt);
  assert.equal(world.player.skillPoints, before + 1);
});
