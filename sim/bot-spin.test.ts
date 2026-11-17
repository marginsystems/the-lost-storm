import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, arena, place } from '../test/arena-support.ts';
import { must } from '../test/support.ts';
import { harmful, hazardDue, spinStep, wheelReach } from './bot-spin.ts';
import type { SkillDef } from './content/types.ts';
import { distance } from './math.ts';
import type { ReadonlyVec2, Vec2 } from './math.ts';
import { offenceOf } from './world/combat.ts';
import { placeHazard } from './world/hazards.ts';
import type { HazardState, MonsterState, World } from './world/types.ts';

function markAt(world: World, at: ReadonlyVec2, later: number): HazardState {
  const caller: MonsterState = place(world, 'test_caller', { x: ARENA_CENTRE.x + 8, z: ARENA_CENTRE.z + 8 });
  const mark: SkillDef = must(world.content.skills.get('test_mark'), 'mark');
  return must(placeHazard(world, offenceOf(caller), mark, at, later), 'hazard');
}

void test('a spinning hero leaves a mark only once it would land before he could step out of it', (): void => {
  const world: World = arena(31);
  const hazard: HazardState = markAt(world, world.player.pos, 0);
  assert.equal(harmful(hazard), true);
  hazard.timeLeft = 0.3;
  assert.equal(hazardDue(world, hazard, world.player.pos, 0.5, 0), true);
  hazard.timeLeft = 30;
  assert.equal(hazardDue(world, hazard, world.player.pos, 0.5, 0), false);
  assert.equal(hazardDue(world, hazard, { x: world.player.pos.x + hazard.radius + 5, z: world.player.pos.z }, 0.5, 0), false);
});

void test('the wheel reaches as far as its nova', (): void => {
  const world: World = arena(32);
  const spin: SkillDef = must(world.content.skills.get('cleave_millwheel'), 'millwheel');
  assert.equal(wheelReach(spin), spin.delivery.type === 'nova' ? spin.delivery.radius : spin.engageRange);
});

void test('a spinning hero steps the shortest way out of a mark and keeps the pack inside the wheel', (): void => {
  const world: World = arena(33);
  world.player.pos = { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z };
  const pack: MonsterState[] = [place(world, 'test_brute', { x: ARENA_CENTRE.x + 2.2, z: ARENA_CENTRE.z }), place(world, 'test_brute', { x: ARENA_CENTRE.x + 2.2, z: ARENA_CENTRE.z + 1.5 })];
  const hazard: HazardState = markAt(world, { x: ARENA_CENTRE.x - 0.6, z: ARENA_CENTRE.z }, 0);
  const safe = (spot: ReadonlyVec2): boolean => distance(spot, hazard.pos) > hazard.radius + 0.5;
  const spot: Vec2 = must(spinStep(world, pack, 2, safe), 'spot');
  assert.ok(safe(spot));
  assert.ok(pack.some((monster: MonsterState): boolean => distance(spot, monster.pos) <= 2 + monster.radius));
  const farther: Vec2 = must(spinStep(world, [], 2, safe), 'fallback');
  assert.ok(distance(spot, world.player.pos) <= distance(farther, world.player.pos) + 3);
  assert.equal(spinStep(world, pack, 2, (): boolean => false), null);
});
