import assert from 'node:assert/strict';
import { test } from 'node:test';
import { echoesOf, fieldWorld, standAt } from '../../test/moment-support.ts';
import { must } from '../../test/support.ts';
import { forceStrike } from './moments.ts';
import { insideShell, shellLimit } from './shell.ts';
import { stepWorld } from './step.ts';
import type { MomentState, MonsterState, World } from './types.ts';

const STEP = 1 / 30;

void test('a point is inside an echo\'s shell only within the bubble less the echo\'s own radius', (): void => {
  const world: World = fieldWorld();
  world.player.invulnerable = Infinity;
  const moment: MomentState = must(forceStrike(world, { x: world.player.pos.x + 20, z: world.player.pos.z }, null), 'a moment');
  for (let elapsed: number = 0; elapsed < world.content.moments.telegraph + STEP * 2; elapsed += STEP) stepWorld(world, [], STEP);
  standAt(world, moment.pos);
  stepWorld(world, [], STEP);
  const echo: MonsterState = must(echoesOf(world, moment)[0], 'an echo');
  const limit: number = shellLimit(moment, echo.radius);
  assert.equal(limit, moment.def.radius - echo.radius);
  assert.equal(insideShell(world, echo, { x: moment.pos.x + limit, z: moment.pos.z }), true);
  assert.equal(insideShell(world, echo, { x: moment.pos.x + limit + 0.1, z: moment.pos.z }), false);
  world.moments = [];
  assert.equal(insideShell(world, echo, { x: moment.pos.x + limit + 10, z: moment.pos.z }), true);
});
