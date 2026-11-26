import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { ZoneWaypoint } from '../content/types.ts';
import { floorCells } from '../nav/layout.ts';
import { heatAt } from './heat.ts';
import type { World } from './types.ts';

void test('the third Mended Ways waypoint has cool footing across its travel radius', (): void => {
  const world: World = worldIn(loadContent(), 'mended_ways_3', 11);
  const waypoint: ZoneWaypoint = must(world.zone.waypoint, 'third Mended Ways waypoint');
  const halfTile: number = world.zone.cellSize / 2;
  for (const cell of floorCells(world.zone)) {
    const dx: number = Math.max(0, Math.abs(cell.x - waypoint.x) - halfTile);
    const dz: number = Math.max(0, Math.abs(cell.z - waypoint.z) - halfTile);
    if (Math.hypot(dx, dz) <= waypoint.radius) {
      assert.equal(heatAt(world, cell.x, cell.z), null, `hot waypoint tile at ${cell.x}, ${cell.z}`);
    }
  }
});
