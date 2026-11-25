import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHESTED, DT, FAR, fieldWorld, quietField, run, standAt, struck } from '../test/moment-support.ts';
import { stepWorld } from './world/step.ts';
import type { MomentState, World } from './world/types.ts';

function woken(world: World): MomentState {
  const moment: MomentState = struck(world, CHESTED.id);
  standAt(world, moment.pos);
  run(world, DT * 2);
  assert.equal(moment.chest, 'closed');
  return moment;
}

void test('a neutral moment whose chest is left closed until it fades counts once toward restraint', (): void => {
  const world: World = fieldWorld(quietField());
  const moment: MomentState = woken(world);
  standAt(world, FAR);
  run(world, world.content.moments.chest.linger + 1);
  assert.equal(moment.outcome, 'played');
  assert.equal(world.player.tally.restraint, 1);
  assert.equal(world.player.tally.moments, 0);
});

void test('opening the chest of a neutral moment counts nothing toward restraint', (): void => {
  const world: World = fieldWorld(quietField());
  const moment: MomentState = woken(world);
  stepWorld(world, [{ type: 'open', momentId: moment.id }], DT);
  run(world, world.content.moments.chest.linger + world.content.moments.chest.open + 1);
  assert.equal(moment.outcome, 'opened');
  assert.equal(world.player.tally.restraint, 0);
});
