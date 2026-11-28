import assert from 'node:assert/strict';
import { test } from 'node:test';
import { faceAt } from '../../test/facing-support.ts';
import { cast, offset, run, shapeArena, SHAPE_DT } from '../../test/shape-support.ts';
import { must } from '../../test/support.ts';
import type { Vec2 } from '../math.ts';
import { refreshPlayer } from './character.ts';
import { readyToRepeat } from './skills.ts';
import type { World } from './types.ts';

void test('holding Flashover can send another flock at its starting cooldown without a weapon attack between casts', (): void => {
  const world: World = shapeArena(['flashover']);
  const aim: Vec2 = offset(6, 0);
  const skill = must(world.player.skills[0], 'Flashover');
  faceAt(world.player, aim);
  assert.ok(cast(world, 0, aim).some((event): boolean => event.type === 'skill_start' && event.skill.id === skill.id));
  assert.equal(skill.cooldown, 1.8);
  run(world, skill.cooldown - 2 * SHAPE_DT);
  assert.equal(readyToRepeat(world.player, skill), false);
  run(world, 2 * SHAPE_DT);
  assert.equal(readyToRepeat(world.player, skill), true);
  assert.ok(cast(world, 0, aim).some((event): boolean => event.type === 'skill_start' && event.skill.id === skill.id));
});

void test('a level 21 Firewalker sustains Flashover from one cast of mana on held repeat', (): void => {
  const world: World = shapeArena([]);
  world.player.level = 21;
  world.player.bar = ['banked_fire'];
  world.player.allocated = ['stone_banked_fire', 'stone_flashover'];
  refreshPlayer(world);
  const skill = must(world.player.skills[0], 'Flashover');
  assert.equal(skill.form, 'flashover');
  assert.ok(Math.abs(skill.cooldown - 1.2) < 1e-9);
  assert.equal(skill.manaCost, 3);
  world.player.mana = skill.manaCost;
  const aim: Vec2 = offset(6, 0);
  faceAt(world.player, aim);
  for (let flock: number = 0; flock < 25; flock += 1) {
    assert.equal(readyToRepeat(world.player, skill), true);
    assert.ok(cast(world, 0, aim).some((event): boolean => event.type === 'skill_start' && event.skill.form === 'flashover'));
    run(world, skill.cooldown + SHAPE_DT);
  }
});
