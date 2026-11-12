import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ZoneDrift } from '../../sim/content/road-types.ts';
import type { ZoneDef } from '../../sim/content/types.ts';
import { OUTPOST_ZONE, SCENE_BASE } from '../../test/road-support.ts';
import type { FloorGrid } from './ground.ts';
import { coverLines, floorGrid, GROUND, growAt, occlusionAt } from './ground.ts';
import { isFloorCell, zoneColumns, zoneRows } from '../../sim/nav/layout.ts';
import { loadContent } from '../../sim/content/content.ts';

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

void test('the ground darkens under a blocking prop and is untouched beyond its reach', (): void => {
  const rock = { x: 10, z: 10, radius: 2 };
  assert.ok(Math.abs(occlusionAt([rock], 10, 10) - GROUND.propShade) < 1e-9);
  assert.equal(occlusionAt([rock], 10 + 2 * GROUND.propReach + 0.1, 10), 1);
  assert.ok(occlusionAt([rock], 11.5, 10) > GROUND.propShade);
  assert.equal(occlusionAt([], 3, 3), 1);
});

void test('a floor grid answers exactly like the tile map, inside the zone and past its edges', (): void => {
  for (const zone of loadContent().zones.values()) {
    const grid: FloorGrid = floorGrid(zone);
    for (let row: number = -3; row < zoneRows(zone) + 3; row += 1) {
      for (let column: number = -3; column < zoneColumns(zone) + 3; column += 1) assert.equal(grid.floor(column, row), isFloorCell(zone, column, row), `${zone.id} ${column},${row}`);
    }
  }
});

void test('a cell is cut into evenly spaced lines shared by neighbouring pieces, with growth only on its outer edges', (): void => {
  const lines: number[] = coverLines(3, 2, 0.1, 0.2);
  assert.equal(lines.length, GROUND.divisions + 1);
  assert.equal(lines[0], 6 - 0.1);
  assert.equal(lines[GROUND.divisions], 6 + 2 + 0.2);
  for (let index: number = 1; index < GROUND.divisions; index += 1) assert.equal(lines[index], 6 + (index * 2) / GROUND.divisions);
});
