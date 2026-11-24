import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, arena, place } from '../test/arena-support.ts';
import { faceAt } from '../test/facing-support.ts';
import { offset, shapeSkill } from '../test/shape-support.ts';
import { botInDanger } from './bot.ts';
import type { AreaDelivery } from './content/shape-types.ts';
import type { SkillDef } from './content/types.ts';
import { startSkill } from './world/skills.ts';
import type { MonsterState, World } from './world/types.ts';

void test('a lane that only strikes on opening threatens the bot during its tell', (): void => {
  const world: World = arena(27);
  const monster: MonsterState = place(world, 'test_brute', offset(-4, 0));
  faceAt(monster, ARENA_CENTRE);
  const base: SkillDef = shapeSkill('test_squall');
  if (base.delivery.type !== 'area') throw new Error('Expected an area fixture');
  const lane: AreaDelivery = { ...base.delivery, range: 1, radius: 0.75, length: 6, pulse: 0, opening: true };
  const opening: SkillDef = { ...base, delivery: lane };
  startSkill(world, monster, opening, { x: 1, z: 0 });
  assert.equal(botInDanger(world, offset(0, 0)), true);
  assert.equal(botInDanger(world, offset(0, 3)), false);
  monster.action = null;
  const quiet: SkillDef = { ...opening, id: 'quiet_lane', delivery: { ...lane, opening: false } };
  startSkill(world, monster, quiet, { x: 1, z: 0 });
  assert.equal(botInDanger(world, offset(0, 0)), false);
});
