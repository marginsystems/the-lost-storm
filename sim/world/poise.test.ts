import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dummy, offset, shapeArena } from '../../test/shape-support.ts';
import { heroShare, pushShare, steadiness } from './poise.ts';
import type { MonsterState, World } from './types.ts';

function withKnockback(monster: MonsterState, knockback: number): MonsterState {
  return { ...monster, def: { ...monster.def, poise: { ...monster.def.poise, knockback } } };
}

void test('steadiness is the share of a shove a monster takes, and the hero always takes his own', (): void => {
  const world: World = shapeArena([]);
  const monster: MonsterState = withKnockback(dummy(world, offset(1, 0)), 0.4);
  assert.equal(steadiness(monster), 0.4);
  assert.equal(steadiness(world.player), 1);
});

void test('two bodies split a push evenly unless one is immune to knockback, which never gives', (): void => {
  const world: World = shapeArena([]);
  const light: MonsterState = withKnockback(dummy(world, offset(1, 0)), 1);
  const heavy: MonsterState = withKnockback(dummy(world, offset(2, 0)), 0.25);
  const rooted: MonsterState = withKnockback(dummy(world, offset(3, 0)), 0);
  assert.equal(pushShare(light, heavy), 0.5);
  assert.equal(pushShare(light, rooted), 1);
  assert.equal(pushShare(rooted, light), 0);
  assert.equal(pushShare(rooted, rooted), 0.5);
  assert.equal(heroShare(light), 0);
  assert.equal(heroShare(rooted), 1);
});
