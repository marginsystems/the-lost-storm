import assert from 'node:assert/strict';
import { test } from 'node:test';
import { faceAt } from '../../test/facing-support.ts';
import { cast, damageTo, dummy, offset, run, shapeArena } from '../../test/shape-support.ts';
import { must } from '../../test/support.ts';
import type { Vec2 } from '../math.ts';
import { cellIndex } from '../nav/grid.ts';
import { refreshPlayer } from './character.ts';
import type { AreaState, GroundLane, MonsterState, World, WorldEvent } from './types.ts';

function firewalker(upgrade: boolean): World {
  const world: World = shapeArena(['thunderclap']);
  world.player.bar[1] = 'thunderclap';
  world.player.allocated = ['stone_thunderclap', 'tempered_body', 'stone_1', 'bedrock', 'stone_4', 'gathered_clap'];
  world.player.changes = { thunderclap: 'thunderclap_gathered' };
  world.player.skillPoints = 1;
  refreshPlayer(world);
  if (upgrade) run(world, 1 / 60, [{ type: 'allocate', node: 'split_seam' }]);
  return world;
}

function swing(world: World): WorldEvent[] {
  const aim: Vec2 = offset(9, 0);
  faceAt(world.player, aim);
  return [...cast(world, 1, aim), ...run(world, 0.2)];
}

function burningGround(world: World): AreaState {
  return must(world.areas.find((area: AreaState): boolean => area.skill.id === 'fire_slam_line'), 'burning ground');
}

void test('the base hammer pierces along its straight line and an upgraded miss still leaves that full line', (): void => {
  const base: World = firewalker(false);
  const junction: MonsterState = dummy(base, offset(3.5, 0));
  const straight: MonsterState = dummy(base, offset(8, 0));
  const side: MonsterState = dummy(base, offset(7.5, 2.7));
  const hits: WorldEvent[] = swing(base);
  assert.equal(damageTo(hits, junction.id).length, 1);
  assert.equal(damageTo(hits, straight.id).length, 1);
  assert.deepEqual(damageTo(hits, side.id), []);
  assert.equal(burningGround(base).fork, undefined);
  const miss: World = firewalker(true);
  dummy(miss, offset(7.5, 2.7));
  assert.equal(must(swing(miss).find((event) => event.type === 'skill_impact'), 'miss').hits, 0);
  const seam: AreaState = burningGround(miss);
  assert.equal(seam.fork, undefined);
  assert.equal(seam.reach, burningGround(base).reach);
  const late: MonsterState = dummy(miss, offset(7, 0));
  assert.equal(damageTo(run(miss, 0.5), late.id).length, 1);
  assert.equal(seam.fork, undefined);
});

void test('the nearest enemy splits the strike once and both burning arms share the same junction', (): void => {
  const world: World = firewalker(true);
  const straight: MonsterState = dummy(world, offset(8, 0));
  const left: MonsterState = dummy(world, offset(7.4, -2.6));
  const right: MonsterState = dummy(world, offset(7.4, 2.6));
  const first: MonsterState = dummy(world, offset(3.5, 0.15));
  const hits: WorldEvent[] = swing(world);
  assert.equal(must(hits.find((event) => event.type === 'skill_impact'), 'strike').hits, 3);
  assert.equal(must(hits.find((event) => event.type === 'damage'), 'first contact').targetId, first.id);
  assert.deepEqual(damageTo(hits, straight.id), []);
  for (const target of [first, left, right]) assert.equal(damageTo(hits, target.id).length, 1);
  const seam: AreaState = burningGround(world);
  const fork = must(seam.fork, 'burning arms');
  const opening = must(hits.find((event) => event.type === 'area' && event.stage === 'start' && event.area.skill.form === 'thunderclap_gathered'), 'opening seam');
  assert.ok(opening.type === 'area');
  assert.deepEqual(opening.area.fork, fork);
  assert.equal(fork.arms.length, 2);
  for (const arm of fork.arms) {
    assert.ok(Math.abs(arm.pos.x - first.pos.x) < 0.5);
    assert.equal(arm.reach, 5);
  }
  const contact: Vec2 = must(fork.arms[0], 'first arm').pos;
  const later: MonsterState = dummy(world, contact);
  const wing: MonsterState = dummy(world, offset(7, -2.4));
  const burns: WorldEvent[] = run(world, 0.5);
  assert.equal(damageTo(burns, later.id).length, 1);
  assert.equal(damageTo(burns, wing.id).length, 1);
});

void test('each branch stops at its own wall', (): void => {
  const world: World = firewalker(true);
  dummy(world, offset(3.5, 0));
  const blocked: MonsterState = dummy(world, offset(7.5, 2.7));
  const wall: Vec2 = offset(5.2, 1);
  world.grid.solid[cellIndex(world.grid, wall.x, wall.z)] = 1;
  const hits: WorldEvent[] = swing(world);
  const arms: readonly GroundLane[] = must(burningGround(world).fork, 'fork').arms;
  assert.ok(must(arms.find((arm: GroundLane): boolean => arm.toward.z > 0), 'walled side').reach < 4);
  assert.equal(must(arms.find((arm: GroundLane): boolean => arm.toward.z < 0), 'open side').reach, 5);
  assert.deepEqual(damageTo(hits, blocked.id), []);
});
