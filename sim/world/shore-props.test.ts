import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { ShoreProp } from '../content/story-types.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import { isWalkable } from '../nav/grid.ts';
import { insideRoom, shoreBlockers, shorePlacements } from './shore-props.ts';
import { stepWorld } from './step.ts';
import type { Vec2 } from '../math.ts';
import type { Command, World } from './types.ts';
import { shiftWorld } from './void.ts';

const content: Content = loadContent();
const DT: number = 1 / 60;
const between: ZoneDef = must(content.zones.get('between'), 'between');

function ashore(): World {
  const world: World = worldIn(content, between.id, 3);
  world.wake = null;
  world.heading = { x: 1, z: 0 };
  world.flags['opening'] = 'read';
  stepWorld(world, [], DT);
  return world;
}

void test('the shore rocks block the ground they stand on, leave the way out open, and move with the world', (): void => {
  const world: World = ashore();
  const rocks = shoreBlockers(world);
  assert.ok(rocks.length > 0);
  const crag = must(shorePlacements(world).find((rock: ShoreProp): boolean => rock.prop === 'crag_b'), 'crag_b');
  assert.equal(isWalkable(world.grid, crag.x, crag.z), false);
  const shore = must(world.shore, 'shore');
  for (let ahead: number = 0; ahead < 40; ahead += 1) assert.ok(isWalkable(world.grid, shore.at.x + shore.facing.x * ahead, shore.at.z + shore.facing.z * ahead), `way out blocked ${ahead} m ashore`);
  shiftWorld(world, { x: -30, z: 4 });
  assert.equal(isWalkable(world.grid, crag.x - 30, crag.z + 4), false);
  const moved = must(world.shore, 'moved shore');
  for (let ahead: number = 0; ahead < 40; ahead += 1) assert.ok(isWalkable(world.grid, moved.at.x + moved.facing.x * ahead, moved.at.z + moved.facing.z * ahead), `way out blocked ${ahead} m ashore after recentring`);
});

function onShore(world: World, across: number, inland: number): Vec2 {
  const shore = must(world.shore, 'shore');
  return { x: shore.at.x + shore.facing.z * across + shore.facing.x * inland, z: shore.at.z - shore.facing.x * across + shore.facing.z * inland };
}

void test('a light placed past the shore walls is pulled back inside the room', (): void => {
  const world: World = ashore();
  const room = must(between.void?.shore?.room, 'room');
  const far: Vec2 = insideRoom(world, onShore(world, 200, 300));
  const corner: Vec2 = onShore(world, room.half - room.margin, room.depth - room.margin);
  assert.ok(Math.hypot(far.x - corner.x, far.z - corner.z) < 1e-6);
  const mist: Vec2 = onShore(world, 3, -10);
  assert.deepEqual(insideRoom(world, mist), mist);
});

void test('holding a move toward the light from anywhere along the opening never pins him on a rock', (): void => {
  for (const across of [-18, -10, -5, 0, 5, 10, 18]) {
    const world: World = ashore();
    const start: Vec2 = onShore(world, across, -1);
    world.player.pos = { x: start.x, z: start.z };
    const goal = (): Vec2 => insideRoom(world, onShore(world, 0, 40));
    const gap = (): number => Math.hypot(world.player.pos.x - goal().x, world.player.pos.z - goal().z);
    for (let step: number = 0; step < 60 * 30 && gap() >= 1.5; step += 1) stepWorld(world, [{ type: 'move', held: true, dest: goal() } satisfies Command], DT);
    assert.ok(gap() < 1.5, `pinned stepping out ${across} m along the opening`);
  }
});

void test('the shore walls leave no gap: walking straight out sideways or past the back stops at the rocks', (): void => {
  const world: World = ashore();
  const room = must(between.void?.shore?.room, 'room');
  for (const [across, ashoreAt] of [[room.half + 3, 20], [-(room.half + 3), 40], [0, room.depth + 3], [room.half + 20, 2.5], [-(room.half + 40), 2.5]] as const) {
    const point: Vec2 = onShore(world, across, ashoreAt);
    assert.equal(isWalkable(world.grid, point.x, point.z), false, `open at ${across}, ${ashoreAt}`);
  }
});
