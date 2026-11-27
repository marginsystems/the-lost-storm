import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { dummy, offset, shapeArena, shapeSkill } from '../../test/shape-support.ts';
import { burnTicks, ignite, offenceOf } from './combat.ts';
import type { SkillDef } from '../content/types.ts';
import type { BurnState, MonsterState, World } from './types.ts';

void test('a weaker burn from another fire skill leaves a stronger burn alight', (): void => {
  const world: World = shapeArena(['thunderclap_gathered']);
  const target: MonsterState = dummy(world, offset(3, 0));
  ignite(world, offenceOf(world.player), target, shapeSkill('thunderclap_gathered'), 100);
  ignite(world, offenceOf(world.player), target, shapeSkill('fire_slam_line'), 10);
  const burn: BurnState = must(target.burn, 'burn');
  assert.equal(burn.source, 'thunderclap_gathered');
  assert.equal(burn.perTick, 100 * must(shapeSkill('thunderclap_gathered').burn, 'hammer burn').share);
});

void test('a stronger burn from another fire skill takes over a weaker one', (): void => {
  const world: World = shapeArena(['thunderclap_gathered']);
  const target: MonsterState = dummy(world, offset(3, 0));
  ignite(world, offenceOf(world.player), target, shapeSkill('fire_slam_line'), 10);
  ignite(world, offenceOf(world.player), target, shapeSkill('thunderclap_gathered'), 100);
  const burn: BurnState = must(target.burn, 'burn');
  assert.equal(burn.source, 'thunderclap_gathered');
  assert.equal(burn.perTick, 100 * must(shapeSkill('thunderclap_gathered').burn, 'hammer burn').share);
});

void test('a burn nearly spent gives way to a weaker one that has longer to run', (): void => {
  const world: World = shapeArena(['thunderclap_gathered']);
  const target: MonsterState = dummy(world, offset(3, 0));
  ignite(world, offenceOf(world.player), target, shapeSkill('thunderclap_gathered'), 20);
  const held: BurnState = must(target.burn, 'burn');
  held.ticksLeft = 1;
  ignite(world, offenceOf(world.player), target, shapeSkill('fire_slam_line'), 20);
  assert.equal(must(target.burn, 'burn').source, 'fire_slam_line');
});

void test('a burn from another fire skill that would deal no more than the one already burning leaves it alight', (): void => {
  const world: World = shapeArena(['thunderclap_gathered']);
  const target: MonsterState = dummy(world, offset(3, 0));
  ignite(world, offenceOf(world.player), target, shapeSkill('thunderclap_gathered'), 20);
  const held: BurnState = must(target.burn, 'burn');
  const line: SkillDef = shapeSkill('fire_slam_line');
  held.perTick = burnTicks(line);
  held.ticksLeft = 1;
  ignite(world, offenceOf(world.player), target, line, 1 / must(line.burn, 'line burn').share);
  assert.equal(must(target.burn, 'burn').source, 'thunderclap_gathered');
});
