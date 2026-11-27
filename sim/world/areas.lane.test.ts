import assert from 'node:assert/strict';
import { test } from 'node:test';
import { faceAt } from '../../test/facing-support.ts';
import { cast, damageTo, dummy, offset, run, shapeArena } from '../../test/shape-support.ts';
import { must } from '../../test/support.ts';
import type { AreaDelivery } from '../content/shape-types.ts';
import type { Vec2 } from '../math.ts';
import { refreshPlayer } from './character.ts';
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

void test('the learned Fire Slam answers a quick press, drives both targets forward and releases the caster to move', (): void => {
  const world: World = shapeArena(['thunderclap']);
  world.player.bar[0] = 'thunderclap';
  world.player.allocated = ['stone_thunderclap', 'gathered_clap'];
  world.player.changes = { thunderclap: 'thunderclap_gathered' };
  refreshPlayer(world);
  assert.equal(world.player.skills[0]?.form, 'thunderclap_gathered');
  const near: MonsterState = dummy(world, offset(2, -0.4));
  const far: MonsterState = dummy(world, offset(6, 0.4));
  const aim: Vec2 = offset(8, 0);
  faceAt(world.player, aim);
  const opening: WorldEvent[] = [...cast(world, 0, aim), ...run(world, 0.2)];
  const strike = must(opening.find((event) => event.type === 'skill_impact'), 'opening strike');
  assert.equal(strike.hits, 2);
  for (const target of [near, far]) {
    const hit = must(opening.find((event): event is Extract<WorldEvent, { type: 'damage' }> => event.type === 'damage' && event.targetId === target.id), 'hammer contact');
    assert.ok(hit.direction.x > 0.99 && Math.abs(hit.direction.z) < 0.01);
  }
  const z: number = world.player.pos.z;
  run(world, 0.25, [{ type: 'move', dest: offset(0, 4), held: false }]);
  assert.ok(world.player.pos.z > z);
});

void test('a Fire Slam that misses still leaves its seam and reports zero enemies hit', (): void => {
  const world: World = shapeArena(['thunderclap_gathered']);
  const aim: Vec2 = offset(8, 0);
  faceAt(world.player, aim);
  dummy(world, offset(3, 4));
  const events: WorldEvent[] = [...cast(world, 0, aim), ...run(world, 0.4)];
  assert.equal(must(events.find((event) => event.type === 'skill_impact'), 'whiff').hits, 0);
  assert.ok(world.areas.some((area: AreaState): boolean => area.skill.id === 'fire_slam_line'));
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
