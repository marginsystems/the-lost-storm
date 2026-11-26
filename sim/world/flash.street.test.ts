import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withoutGlitches, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Vec2 } from '../math.ts';
import { stepWorld } from './step.ts';
import type { World } from './types.ts';

const STREET = { east: 19.2, south: 34, north: 28, tolerance: 0.3, ticks: 120, dt: 1 / 30 } as const;

function walkTo(world: World, dest: Vec2, alongEdge: boolean): void {
  for (let tick: number = 0; tick < STREET.ticks; tick += 1) {
    stepWorld(world, tick === 0 ? [{ type: 'move', dest, held: false }] : [], STREET.dt);
    assert.equal(world.zone.id, 'next_moment');
    const at: Vec2 = world.player.pos;
    if (alongEdge) assert.ok(Math.abs(at.x - STREET.east) < STREET.tolerance, 'the bench diverts the hero off the east edge of the street');
    if (Math.hypot(at.x - dest.x, at.z - dest.z) < STREET.tolerance) return;
  }
  assert.fail('the hero never reached the other side of the bench');
}

void test('the east edge of the lit street can be walked past the bench in both directions before the flash ends', (): void => {
  const world: World = withoutGlitches(worldIn(loadContent(), 'next_moment', 11));
  walkTo(world, { x: STREET.east, z: STREET.south }, false);
  walkTo(world, { x: STREET.east, z: STREET.north }, true);
  walkTo(world, { x: STREET.east, z: STREET.south }, true);
});
