import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import { distanceToCell, isFloorCell, outsideCells } from './layout.ts';
import type { OutsideCell } from './layout.ts';
import { zoneOf } from '../../test/support.ts';

const content: Content = loadContent();
const road: ZoneDef = zoneOf(content, 'duskway');

void test('outside cells ring the floor within the reach and never overlap it', (): void => {
  const ring: OutsideCell[] = outsideCells(road, 1);
  assert.ok(ring.length > 0);
  for (const cell of ring) {
    assert.ok(!isFloorCell(road, cell.column, cell.row));
    let touches: boolean = false;
    for (let dr: number = -1; dr <= 1; dr += 1) {
      for (let dc: number = -1; dc <= 1; dc += 1) touches = touches || isFloorCell(road, cell.column + dc, cell.row + dr);
    }
    assert.ok(touches);
  }
  assert.ok(ring.some((cell: OutsideCell): boolean => cell.row < 0));
  assert.ok(outsideCells(road, 3).length > ring.length);
  assert.deepEqual(new Set(ring.map((cell: OutsideCell): string => `${cell.column},${cell.row}`)).size, ring.length);
});

void test('the distance to a cell is zero inside it and grows outside', (): void => {
  assert.equal(distanceToCell(6, 6, 1, 1, 4), 0);
  assert.equal(distanceToCell(10, 6, 1, 1, 4), 2);
  assert.equal(distanceToCell(11, 12, 1, 1, 4), 5);
});
