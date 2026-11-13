import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { standAt } from '../../test/moment-support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { MomentField } from '../content/moment-types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { BUBBLE } from './bubble.ts';
import { createWorld } from './create.ts';
import { echoMonsters, forceStrike } from './moments.ts';
import { stepWorld } from './step.ts';
import type { Command, MomentState, MonsterState, World } from './types.ts';
import { enterZone } from './zones.ts';

const PROBE = { dt: 1 / 30, east: 30, press: 30, clearBy: 45, clickEvery: 8, bearings: 8, spread: 0.6, outside: 2, slack: 1e-6 } as const;

const content: Content = loadContent();
const field: MomentField = must(must(content.zones.get('hall_of_time'), 'hall').moments, 'hall moments');
const HALL_MOMENTS: readonly string[] = [...new Set([...field.first, ...field.table].map((entry) => entry.moment))];

function awakeIn(momentId: string, seed: number, from: Vec2 = { x: 0, z: 0 }): { world: World; moment: MomentState } {
  const world: World = createWorld(content, { seed, save: null });
  enterZone(world, must(content.zones.get('hall_of_time'), 'hall'), { type: 'start' });
  world.monsters = [];
  world.player.invulnerable = Infinity;
  const at: Vec2 = { x: world.player.pos.x + PROBE.east, z: world.player.pos.z };
  const moment: MomentState = must(forceStrike(world, at, momentId), momentId);
  for (let elapsed: number = 0; elapsed < content.moments.telegraph + PROBE.dt * 2; elapsed += PROBE.dt) stepWorld(world, [], PROBE.dt);
  standAt(world, { x: moment.pos.x + from.x, z: moment.pos.z + from.z });
  stepWorld(world, [], PROBE.dt);
  assert.equal(moment.phase, 'awake');
  return { world, moment };
}

function clickOn(target: MonsterState | undefined, tick: number): Command[] {
  return target !== undefined && tick % PROBE.clickEvery === 0 ? [{ type: 'skill', slot: 0, aim: { x: target.pos.x, z: target.pos.z }, targetId: target.id }] : [];
}

function outsideBy(moment: MomentState, monster: MonsterState): number {
  return distance(monster.pos, moment.pos) - (moment.def.radius - monster.radius);
}

for (const momentId of HALL_MOMENTS) {
  void test(`every echo of ${momentId} stays inside its shell while the hero presses it toward each of eight bearings`, (): void => {
    for (let bearing: number = 0; bearing < PROBE.bearings; bearing += 1) {
      const { world, moment } = awakeIn(momentId, bearing + 1);
      const angle: number = (bearing / PROBE.bearings) * Math.PI * 2;
      const echoes: MonsterState[] = echoMonsters(world, moment);
      for (const echo of echoes) echo.pos = { x: moment.pos.x + Math.sin(angle) * moment.def.radius * PROBE.spread, z: moment.pos.z + Math.cos(angle) * moment.def.radius * PROBE.spread };
      for (let tick: number = 0; tick * PROBE.dt < PROBE.press; tick += 1) {
        for (const echo of echoes) echo.life = echo.maxLife;
        const target: MonsterState | undefined = echoes.find((echo: MonsterState): boolean => echo.alive);
        stepWorld(world, clickOn(target, tick), PROBE.dt);
        assert.notEqual(moment.outcome, 'left', `${momentId} bearing ${String(bearing)}: the hero walked out`);
        for (const echo of echoes) assert.ok(outsideBy(moment, echo) <= PROBE.slack, `${momentId} bearing ${String(bearing)}: ${echo.def.id} outside at ${(tick * PROBE.dt).toFixed(1)} s`);
      }
    }
  });
}

void test('clicking on the first fire\'s thrower from inside clears the moment without the hero ever leaving the bubble', (): void => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const { world, moment } = awakeIn('first_fire', seed, { x: 1, z: 0 });
    for (let tick: number = 0; tick * PROBE.dt < PROBE.clearBy && moment.outcome === null; tick += 1) {
      const living: MonsterState[] = echoMonsters(world, moment).filter((echo: MonsterState): boolean => echo.alive);
      stepWorld(world, clickOn(living.find((echo: MonsterState): boolean => echo.def.id === 'first_thrower') ?? living[0], tick), PROBE.dt);
      assert.ok(distance(world.player.pos, moment.pos) <= moment.def.radius, `seed ${String(seed)}: the hero left at ${(tick * PROBE.dt).toFixed(1)} s`);
    }
    assert.equal(moment.outcome, 'resolved', `seed ${String(seed)}`);
    assert.equal(world.flags['first_moment'], 'cleared');
  }
});

void test('an echo found outside its shell is eased back in, not popped', (): void => {
  const { world, moment } = awakeIn('first_fire', 2);
  const echo: MonsterState = must(echoMonsters(world, moment)[0], 'an echo');
  echo.pos = { x: moment.pos.x + moment.def.radius + PROBE.outside, z: moment.pos.z };
  const before: number = outsideBy(moment, echo);
  stepWorld(world, [], PROBE.dt);
  const after: number = outsideBy(moment, echo);
  assert.ok(after < before, 'moved inward');
  assert.ok(before - after <= BUBBLE.easeSpeed * PROBE.dt + echo.def.moveSpeed * PROBE.dt + PROBE.slack, `jumped ${(before - after).toFixed(2)} m in one step`);
  for (let elapsed: number = 0; elapsed < PROBE.outside; elapsed += PROBE.dt) stepWorld(world, [], PROBE.dt);
  assert.ok(outsideBy(moment, echo) <= PROBE.slack);
});

void test('a ground click outside the shell still walks the hero out of the bubble', (): void => {
  const { world, moment } = awakeIn('first_fire', 3);
  for (const echo of echoMonsters(world, moment)) echo.pos = { x: moment.pos.x, z: moment.pos.z + moment.def.radius * PROBE.spread };
  const dest: Vec2 = { x: moment.pos.x, z: moment.pos.z - moment.def.radius - PROBE.outside };
  stepWorld(world, [{ type: 'move', held: false, dest }], PROBE.dt);
  for (let elapsed: number = 0; elapsed < PROBE.press && moment.outcome === null; elapsed += PROBE.dt) stepWorld(world, [], PROBE.dt);
  assert.equal(moment.outcome, 'left');
});
