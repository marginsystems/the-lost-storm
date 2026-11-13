import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { ShoreProp } from '../content/story-types.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import { isWalkable } from '../nav/grid.ts';
import { shoreBlockers, shorePlacements } from './shore-props.ts';
import { stepWorld } from './step.ts';
import type { World } from './types.ts';
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
  assert.equal(isWalkable(world.grid, crag.x, crag.z), true);
  assert.equal(isWalkable(world.grid, crag.x - 30, crag.z + 4), false);
});
