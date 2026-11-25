import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, SkillDef } from '../content/types.ts';
import { heldForm } from './character.ts';
import type { World } from './types.ts';

const content: Content = loadContent();
const roll: SkillDef = must(content.skills.get('dodge_roll'), 'dodge roll');
const shoulder: SkillDef = must(content.skills.get('dodge_roll_shoulder'), 'shoulder through');

void test('a skill the tree turns into another form is shown as that form, with its name and icon', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 3);
  world.player.allocated = ['shoulder_through'];
  world.player.wielding = 'heavy';
  const form: SkillDef = heldForm(content, world.player, roll);
  assert.deepEqual([form.id, form.form, form.name, form.icon], ['dodge_roll', 'dodge_roll_shoulder', shoulder.name, shoulder.icon]);
});

void test('a skill nothing changes is shown as itself', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 3);
  world.player.allocated = [];
  const form: SkillDef = heldForm(content, world.player, roll);
  assert.deepEqual([form.name, form.icon], [roll.name, roll.icon]);
});
