import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dummy, offset, run, shapeArena, shapeSkill } from '../../test/shape-support.ts';
import type { AreaDelivery } from '../content/shape-types.ts';
import type { SkillDef } from '../content/types.ts';
import { leftBehind } from '../powers.ts';
import { exposedScale } from './aura.ts';
import type { MonsterState, World } from './types.ts';

function lasting(skill: SkillDef): number {
  const delivery: AreaDelivery | null = skill.delivery.type === 'area' ? skill.delivery : null;
  if (delivery === null) throw new Error(`${skill.id} is not an area`);
  return delivery.duration;
}

function underHearth(): World {
  const world: World = shapeArena(['hearth_aura']);
  run(world, 0.8, [{ type: 'skill', slot: 0, aim: offset(1, 0), targetId: null }]);
  return world;
}

void test('the wall drawn while Hearth Aura stands burns half again as long', (): void => {
  const plain: World = shapeArena([]);
  const warmed: World = underHearth();
  const before: number = lasting(leftBehind(plain, plain.player.id, shapeSkill('firewall'), shapeSkill('firewall_segment')));
  const after: number = lasting(leftBehind(warmed, warmed.player.id, shapeSkill('firewall'), shapeSkill('firewall_segment')));
  assert.ok(Math.abs(after - before * 1.5) < 1e-6, `${before} became ${after}`);
});

void test('an enemy inside Hearth Aura takes more from the wall and its flare, and no more from a plain blow', (): void => {
  const world: World = underHearth();
  const inside: MonsterState = dummy(world, offset(3, 0));
  assert.equal(exposedScale(world, world.player, inside, shapeSkill('firewall_segment')), 1.2);
  assert.equal(exposedScale(world, world.player, inside, shapeSkill('flashover_burst')), 1.2);
  assert.equal(exposedScale(world, world.player, inside, shapeSkill('cleave')), 1);
});
