import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shapeArena, shapeSkill } from '../../test/shape-support.ts';
import type { SkillDef } from '../content/types.ts';
import { leftBehind } from '../powers.ts';
import type { World } from './types.ts';

function wallSegment(world: World): SkillDef {
  return leftBehind(world, world.player.id, shapeSkill('firewall'), shapeSkill('firewall_segment'));
}

void test('Long Burn makes every wall drawn burn half again as long and hit a quarter harder', (): void => {
  const plain: World = shapeArena([]);
  const burning: World = shapeArena([]);
  burning.player.allocated = ['stone_firewall'];
  const before: SkillDef = wallSegment(plain);
  const after: SkillDef = wallSegment(burning);
  if (before.delivery.type !== 'area' || after.delivery.type !== 'area') throw new Error('a wall segment is an area');
  assert.ok(Math.abs(after.delivery.duration - before.delivery.duration * 1.5) < 1e-6, `${before.delivery.duration} became ${after.delivery.duration}`);
  assert.ok(Math.abs(after.damage.weaponPercent - before.damage.weaponPercent * 1.25) < 1e-6, `${before.damage.weaponPercent} became ${after.damage.weaponPercent}`);
});
