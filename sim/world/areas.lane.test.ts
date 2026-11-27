import assert from 'node:assert/strict';
import { test } from 'node:test';
import { faceAt } from '../../test/facing-support.ts';
import { cast, damageTo, dummy, offset, run, shapeArena } from '../../test/shape-support.ts';
import { must } from '../../test/support.ts';
import type { AreaDelivery } from '../content/shape-types.ts';
import type { Vec2 } from '../math.ts';
import { areaAxisPoint, areaCovers, areaOf } from './areas.ts';
import type { AreaState, MonsterState, World, WorldEvent } from './types.ts';

void test('Fire Slam strikes along the line ahead and nothing beside or behind it', (): void => {
  const world: World = shapeArena(['thunderclap_gathered']);
  const far: MonsterState = dummy(world, offset(7, 0));
  const beside: MonsterState = dummy(world, offset(4, 3));
  const behind: MonsterState = dummy(world, offset(-3, 0));
  faceAt(world.player, offset(9, 0));
  const events: WorldEvent[] = [...cast(world, 0, offset(9, 0)), ...run(world, 0.6)];
  assert.ok(damageTo(events, far.id).length > 0);
  assert.equal(damageTo(events, beside.id).length, 0);
  assert.equal(damageTo(events, behind.id).length, 0);
});

void test('the line Fire Slam leaves keeps burning whatever walks into it', (): void => {
  const world: World = shapeArena(['thunderclap_gathered']);
  faceAt(world.player, offset(9, 0));
  run(world, 0.1, [{ type: 'skill', slot: 0, aim: offset(9, 0), targetId: null }]);
  run(world, 0.8);
  const line: AreaState = must(world.areas.find((area: AreaState): boolean => area.skill.id === 'fire_slam_line'), 'line');
  assert.ok(line.reach > 7);
  const late: MonsterState = dummy(world, offset(5, 0));
  const events: WorldEvent[] = run(world, 1.2);
  assert.ok(damageTo(events, late.id).length > 0);
});

void test('a lane covers a strip from its start along its heading, and its axis point is the nearest point on that line', (): void => {
  const world: World = shapeArena(['thunderclap_gathered']);
  faceAt(world.player, offset(9, 0));
  run(world, 0.4, [{ type: 'skill', slot: 0, aim: offset(9, 0), targetId: null }]);
  const slam: AreaState = must(world.areas.find((area: AreaState): boolean => area.skill.id === 'thunderclap_gathered'), 'slam');
  const delivery: AreaDelivery = must(areaOf(slam.skill), 'lane');
  const start: Vec2 = { x: world.player.pos.x + delivery.range, z: world.player.pos.z };
  assert.ok(Math.abs(slam.pos.x - start.x) < 0.05 && Math.abs(slam.pos.z - start.z) < 0.05);
  assert.ok(areaCovers(slam, delivery, { x: start.x + 6, z: start.z + 0.5 }, 0.3));
  assert.ok(!areaCovers(slam, delivery, { x: start.x + 6, z: start.z + 2 }, 0.3));
  assert.ok(!areaCovers(slam, delivery, { x: start.x - 2, z: start.z }, 0.3));
  const axis: Vec2 = areaAxisPoint(slam, delivery, { x: start.x + 5, z: start.z + 0.5 });
  assert.ok(Math.abs(axis.x - (start.x + 5)) < 1e-6 && Math.abs(axis.z - start.z) < 1e-6);
});
