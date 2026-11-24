import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CONTENT } from '../test/arena-support.ts';
import { must } from '../test/support.ts';
import type { AreaDelivery } from './content/shape-types.ts';
import type { SkillDef } from './content/types.ts';
import { resolveLeft, resolveSkill } from './stats.ts';

function skill(id: string): SkillDef {
  return must(ARENA_CONTENT.skills.get(id), id);
}

function areaOf(def: SkillDef): AreaDelivery {
  if (def.delivery.type !== 'area') throw new Error(`${def.id} is not an area`);
  return def.delivery;
}

const KILN: readonly string[] = ['kiln_2', 'kiln_draught_hole', 'kiln_3'];

void test('the line Fire Slam leaves takes the fire bonuses of the tree as Fire Slam does', (): void => {
  const line: SkillDef = skill('fire_slam_line');
  const kept: SkillDef = resolveLeft(ARENA_CONTENT, skill('fire_slam'), line, KILN);
  const base: AreaDelivery = areaOf(line);
  const left: AreaDelivery = areaOf(kept);
  assert.ok(Math.abs(kept.damage.weaponPercent - line.damage.weaponPercent * 1.06) < 1e-9);
  assert.ok(Math.abs(left.duration - base.duration * 1.1) < 1e-9);
  assert.ok(Math.abs(left.radius - base.radius * 1.2) < 1e-9);
  assert.ok(Math.abs(left.length - base.length * 1.2) < 1e-9);
});

void test('ground left by a skill outside the fire group takes no fire bonus', (): void => {
  const line: SkillDef = skill('fire_slam_line');
  assert.deepEqual(resolveLeft(ARENA_CONTENT, skill('cleave'), line, KILN), line);
});

void test('a bonus to area lengthens a lane as well as widening it', (): void => {
  const slam: AreaDelivery = areaOf(resolveSkill(ARENA_CONTENT, skill('fire_slam'), ['kiln_draught_hole']));
  const base: AreaDelivery = areaOf(skill('fire_slam'));
  assert.ok(Math.abs(slam.length - base.length * 1.2) < 1e-9);
  assert.ok(Math.abs(slam.radius - base.radius * 1.2) < 1e-9);
});
