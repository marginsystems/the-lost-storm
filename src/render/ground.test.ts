import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ZoneDrift } from '../../sim/content/road-types.ts';
import type { ZoneDef } from '../../sim/content/types.ts';
import { OUTPOST_ZONE, SCENE_BASE } from '../../test/road-support.ts';
import { GROUND, growAt } from './ground.ts';

const DRIFT: ZoneDrift = { id: 'drift', column: 1, row: 1, columns: 1, rows: 1, period: 10, open: 0.5, offset: 0, fade: 1 };
const STRIP: ZoneDef = { ...SCENE_BASE, tiles: ['   ', '.,.', '   '], walls: null };

void test('an open-edged floor cell grows only toward the edge, never over a neighbouring floor cell', (): void => {
  assert.deepEqual(growAt(STRIP, 0, 1), { left: GROUND.openEdgeOverlap, top: GROUND.openEdgeOverlap, right: 0, bottom: GROUND.openEdgeOverlap });
  assert.deepEqual(growAt(STRIP, 1, 1), { left: 0, top: GROUND.openEdgeOverlap, right: 0, bottom: GROUND.openEdgeOverlap });
  assert.deepEqual(growAt(STRIP, 2, 1), { left: 0, top: GROUND.openEdgeOverlap, right: GROUND.openEdgeOverlap, bottom: GROUND.openEdgeOverlap });
});

void test('a drifting patch and the ground beside it overlap where they meet', (): void => {
  const drifting: ZoneDef = { ...STRIP, drifts: [DRIFT] };
  assert.equal(growAt(drifting, 0, 1).right, GROUND.openEdgeOverlap);
  assert.equal(growAt(drifting, 1, 1).left, GROUND.openEdgeOverlap);
  assert.equal(growAt(drifting, 1, 1).right, GROUND.openEdgeOverlap);
});

void test('a walled zone never grows its floor cells', (): void => {
  const walled: ZoneDef = OUTPOST_ZONE;
  assert.equal(walled.walls === null, false);
  assert.deepEqual(growAt({ ...STRIP, walls: walled.walls }, 1, 1), { left: 0, top: 0, right: 0, bottom: 0 });
});
