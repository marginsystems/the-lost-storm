import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { applyHit, offenceOf } from './combat.ts';
import { gainFlaskCharges, refillFlasks } from './flask-charges.ts';
import type { FlaskState, MonsterState, World } from './types.ts';

const content: Content = loadContent();

function empty(): World {
  const world: World = worldIn(content, 'duskway', 5);
  for (const flask of world.player.flasks) flask.charges = 0;
  return world;
}

void test('a kill adds each flask its charges per kill, up to the maximum', (): void => {
  const world: World = empty();
  const red: FlaskState = must(world.player.flasks[0], 'life flask');
  gainFlaskCharges(world.player);
  assert.equal(red.charges, red.def.chargesPerKill);
  for (let kill: number = 0; kill < red.def.maxCharges; kill += 1) gainFlaskCharges(world.player);
  assert.equal(red.charges, red.def.maxCharges);
});

void test('a refill tops every flask up', (): void => {
  const world: World = empty();
  refillFlasks(world.player);
  assert.ok(world.player.flasks.every((flask: FlaskState): boolean => flask.charges === flask.def.maxCharges));
});

void test('killing a monster fills the flasks', (): void => {
  const world: World = empty();
  const monster: MonsterState = must(world.monsters.find((candidate: MonsterState): boolean => candidate.alive), 'monster');
  monster.life = 1;
  applyHit(world, offenceOf(world.player), monster, must(world.player.skills[0], 'skill'), { x: 1, z: 0 });
  assert.equal(monster.alive, false);
  assert.ok(world.player.flasks.every((flask: FlaskState): boolean => flask.charges === flask.def.chargesPerKill));
});
