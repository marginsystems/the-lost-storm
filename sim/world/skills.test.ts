import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { ComboStep, Content, SkillDef } from '../content/types.ts';
import { chainedSkill, comboHits } from './skills.ts';
import { stepWorld } from './step.ts';
import type { Command, World, WorldEvent } from './types.ts';

const content: Content = loadContent();
const DT: number = 1 / 60;
const cleave: SkillDef = must(content.skills.get('cleave'), 'cleave');
const steps: readonly ComboStep[] = must(cleave.combo, 'cleave combo').steps;
const swing: Command = { type: 'skill', slot: 0, aim: { x: 28, z: 30 }, targetId: null };

type Start = Extract<WorldEvent, { readonly type: 'skill_start' }>;

function fresh(): World {
  return worldIn(content, 'drowned_bastion', 3);
}

function swingOnce(world: World): Start {
  const events: WorldEvent[] = stepWorld(world, [swing], DT);
  const started: Start | undefined = events.find((event: WorldEvent): event is Start => event.type === 'skill_start');
  for (let step: number = 0; step < 600 && world.player.action !== null; step += 1) stepWorld(world, [], DT);
  return must(started, 'skill_start');
}

function wait(world: World, seconds: number): void {
  for (let step: number = 0; step < Math.round(seconds / DT); step += 1) stepWorld(world, [], DT);
}

void test('the basic attack is a chain: three swings in a row play three different clips and the third hits hardest', (): void => {
  const world: World = fresh();
  const first: Start = swingOnce(world);
  const second: Start = swingOnce(world);
  const third: Start = swingOnce(world);
  assert.equal(steps.length, 2);
  assert.deepEqual([first.skill.animation, second.skill.animation, third.skill.animation], [cleave.animation, steps[0]?.animation, steps[1]?.animation]);
  assert.equal(new Set<string>([first.skill.animation, second.skill.animation, third.skill.animation]).size, 3);
  assert.deepEqual([first.skill.id, second.skill.id, third.skill.id], ['cleave', 'cleave', 'cleave']);
  assert.ok(third.skill.damage.weaponPercent > second.skill.damage.weaponPercent && second.skill.damage.weaponPercent >= first.skill.damage.weaponPercent);
  assert.ok(third.skill.knockback > first.skill.knockback);
  assert.ok(third.skill.hitStop > first.skill.hitStop && third.skill.shake > first.skill.shake);
});

void test('after the last step the chain starts again from the opening swing', (): void => {
  const world: World = fresh();
  swingOnce(world);
  swingOnce(world);
  swingOnce(world);
  assert.equal(swingOnce(world).skill.animation, cleave.animation);
  assert.equal(swingOnce(world).skill.animation, steps[0]?.animation);
});

void test('a pause longer than the combo window drops the chain, and a shorter one keeps it', (): void => {
  const world: World = fresh();
  const window: number = must(cleave.combo, 'combo').window;
  swingOnce(world);
  wait(world, window * 0.5);
  assert.equal(swingOnce(world).skill.animation, steps[0]?.animation);
  wait(world, window + 0.1);
  assert.equal(world.player.combo, null);
  assert.equal(swingOnce(world).skill.animation, cleave.animation);
});

void test('another skill between swings breaks the chain', (): void => {
  const world: World = fresh();
  swingOnce(world);
  stepWorld(world, [{ type: 'skill', slot: 2, aim: { x: 28, z: 30 }, targetId: null }], DT);
  assert.equal(world.player.combo, null);
  wait(world, 1);
  assert.equal(swingOnce(world).skill.animation, cleave.animation);
});

void test('a combo step scales the skill as the tree has changed it, so passives carry through the chain', (): void => {
  const world: World = fresh();
  assert.ok(cleave.delivery.type === 'arc');
  const widened: SkillDef = { ...cleave, delivery: { ...cleave.delivery, reach: cleave.delivery.reach * 1.4 }, damage: { ...cleave.damage, weaponPercent: cleave.damage.weaponPercent * 2 } };
  const chain = { ...world.player, combo: { skill: 'cleave', hits: 2, timeLeft: 1 } };
  const plain: SkillDef = chainedSkill(chain, cleave);
  const wide: SkillDef = chainedSkill(chain, widened);
  assert.ok(plain.delivery.type === 'arc' && wide.delivery.type === 'arc');
  assert.ok(Math.abs(wide.delivery.reach / plain.delivery.reach - 1.4) < 1e-9);
  assert.ok(Math.abs(wide.damage.weaponPercent / plain.damage.weaponPercent - 2) < 1e-9);
  assert.equal(wide.id, 'cleave');
});

void test('comboHits counts only a live chain of the same skill', (): void => {
  const world: World = fresh();
  const bolt: SkillDef = must(content.skills.get('storm_bolt'), 'storm_bolt');
  assert.equal(comboHits(world.player, cleave), 0);
  assert.equal(comboHits({ ...world.player, combo: { skill: 'cleave', hits: 1, timeLeft: 0.2 } }, cleave), 1);
  assert.equal(comboHits({ ...world.player, combo: { skill: 'cleave', hits: 1, timeLeft: 0 } }, cleave), 0);
  assert.equal(comboHits({ ...world.player, combo: { skill: 'cleave', hits: steps.length + 1, timeLeft: 0.2 } }, cleave), 0);
  assert.equal(comboHits({ ...world.player, combo: { skill: 'storm_bolt', hits: 1, timeLeft: 0.2 } }, cleave), 0);
  assert.equal(comboHits({ ...world.player, combo: { skill: 'storm_bolt', hits: 1, timeLeft: 0.2 } }, bolt), 0);
});
