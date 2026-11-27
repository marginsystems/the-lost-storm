import assert from 'node:assert/strict';
import { test } from 'node:test';
import { faceAt } from '../../test/facing-support.ts';
import { cast, offset, run, shapeArena, SHAPE_DT } from '../../test/shape-support.ts';
import { must } from '../../test/support.ts';
import type { Vec2 } from '../math.ts';
import { readyToRepeat } from './skills.ts';
import type { World } from './types.ts';

void test('holding Flashover can send another flock at 2.5 seconds without a weapon attack between casts', (): void => {
  const world: World = shapeArena(['flashover']);
  const aim: Vec2 = offset(6, 0);
  const skill = must(world.player.skills[0], 'Flashover');
  faceAt(world.player, aim);
  assert.ok(cast(world, 0, aim).some((event): boolean => event.type === 'skill_start' && event.skill.id === skill.id));
  run(world, 2.5 - 2 * SHAPE_DT);
  assert.equal(readyToRepeat(world.player, skill), false);
  run(world, 2 * SHAPE_DT);
  assert.equal(readyToRepeat(world.player, skill), true);
  assert.ok(cast(world, 0, aim).some((event): boolean => event.type === 'skill_start' && event.skill.id === skill.id));
});
