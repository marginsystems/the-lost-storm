import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import type { ChartPoint } from './chart-model.ts';
import { armShape, boltPoints, CHART_STORM, hexColour, polyline, spiralOffset } from './chart-storm.ts';
import type { ArmShape } from './chart-storm.ts';

const content: Content = loadContent();
const EYE: ChartPoint = { x: 500, y: 500 };

void test('a lightning link starts and ends on its places, curves around the eye and is the same every time', (): void => {
  const from: ChartPoint = { x: 700, y: 500 };
  const to: ChartPoint = { x: 500, y: 700 };
  const bolt: ChartPoint[] = boltPoints(from, to, EYE, 'a>b', 46);
  assert.deepEqual(bolt[0], from);
  assert.deepEqual(bolt.at(-1), to);
  assert.ok(bolt.length > 3);
  const jag: number = CHART_STORM.boltJag * 46 + 1e-9;
  assert.ok(bolt.every((point: ChartPoint): boolean => Math.abs(Math.hypot(point.x - EYE.x, point.y - EYE.y) - 200) <= jag));
  assert.deepEqual(boltPoints(from, to, EYE, 'a>b', 46), bolt);
  assert.notDeepEqual(boltPoints(from, to, EYE, 'c>d', 46), bolt);
});

void test('a lightning link out of the eye runs straight outward', (): void => {
  const to: ChartPoint = { x: 500, y: 300 };
  const bolt: ChartPoint[] = boltPoints(EYE, to, EYE, 'eye>a', 46);
  const jag: number = CHART_STORM.boltJag * 46 + 1e-9;
  assert.ok(bolt.every((point: ChartPoint): boolean => Math.abs(point.x - 500) <= jag && point.y <= 500 + jag));
});

void test('each arm band lies along its places, and reaches as far as its farthest place', (): void => {
  for (const path of content.chart.paths) {
    const shape: ArmShape = armShape(content, path.id);
    const own = content.skillTree.filter((node): boolean => node.path === path.id);
    assert.equal(shape.reach, Math.max(...own.map((node): number => Math.hypot(node.column, node.row))));
    const offsets: number[] = own.filter((node): boolean => Math.hypot(node.column, node.row) > 1).map((node): number => Math.abs(spiralOffset(shape, content.chart.twist, { x: node.column, y: node.row })));
    const inside: number = offsets.filter((offset: number): boolean => offset < Math.PI / content.chart.paths.length).length;
    assert.ok(inside / offsets.length > 0.8, `${path.id} band follows its places`);
  }
});

void test('a tint reads as three channels from 0 to 1, and a bad tint reads as white', (): void => {
  assert.deepEqual(hexColour('#ff0080'), [1, 0, 128 / 255]);
  assert.deepEqual(hexColour('teal'), [1, 1, 1]);
  assert.equal(polyline([{ x: 0, y: 0 }, { x: 10.04, y: 5 }]), '0,0 10,5');
});
