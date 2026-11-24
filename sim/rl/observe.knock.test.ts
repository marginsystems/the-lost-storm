import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, SkillDef } from '../content/types.ts';
import { must } from '../../test/support.ts';
import { applyHit, offenceOf } from '../world/combat.ts';
import { knockTime } from '../world/movement.ts';
import { stepWorld } from '../world/step.ts';
import type { PlayerState } from '../world/types.ts';
import type { Duel } from './duel.ts';
import { createDuel, duelObservation } from './duel.ts';
import { SELF_FEATURES } from './contract.ts';
import type { Observation } from './observe.ts';

const CONTENT: Content = loadContent();
const BOLT: SkillDef = must(CONTENT.skills.get('storm_bolt'), 'storm bolt');
const SETTLE = { seconds: 2, dt: 1 / 30 } as const;

function selfValue(seen: Observation, name: string): number {
  return seen.obs[SELF_FEATURES.indexOf(name)] ?? Number.NaN;
}

void test('a hero shoved by another hero sees how long it still slides and how long the knock grace lasts, and both run out', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: 4, jitter: 0 });
  const [first, second] = duel.seats;
  const struck: PlayerState = must(second, 'struck seat').hero;
  const striker: PlayerState = must(first, 'striker seat').hero;
  const before: Observation = duelObservation(duel, must(second, 'struck seat'));
  assert.equal(selfValue(before, 'knock_left'), 0);
  assert.equal(selfValue(before, 'knock_grace'), 0);
  assert.ok(applyHit(duel.world, offenceOf(striker), struck, BOLT, { x: 1, z: 0 }));
  const shoved: Observation = duelObservation(duel, must(second, 'struck seat'));
  assert.ok(selfValue(shoved, 'knock_left') > 0);
  assert.ok(Math.abs(selfValue(shoved, 'knock_left') - knockTime(struck)) < 1e-6);
  assert.ok(Math.abs(selfValue(shoved, 'knock_grace') - CONTENT.player.knockGrace) < 1e-6);
  for (let time: number = 0; time < SETTLE.seconds; time += SETTLE.dt) stepWorld(duel.world, [], SETTLE.dt);
  const settled: Observation = duelObservation(duel, must(second, 'struck seat'));
  assert.equal(selfValue(settled, 'knock_left'), 0);
  assert.equal(selfValue(settled, 'knock_grace'), 0);
});
