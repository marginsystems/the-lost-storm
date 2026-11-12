import assert from 'node:assert/strict';
import { test } from 'node:test';
import { along, inside, roughen, scatter, seeded, smoothPath } from './atlas-geometry.ts';
import type { Spot } from './atlas-geometry.ts';

const square: readonly Spot[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

void test('the same seed draws the same map every time', (): void => {
  const a = seeded(7);
  const b = seeded(7);
  const drawn: number[] = [a(), a(), a()];
  assert.deepEqual(drawn, [b(), b(), b()]);
  assert.ok(drawn.every((value: number): boolean => value >= 0 && value < 1));
  assert.notEqual(seeded(8)(), drawn[0]);
});

void test('a smooth path passes through every point and closes a coast', (): void => {
  const open: string = smoothPath(square, false);
  assert.ok(open.startsWith('M0.0 0.0C'));
  assert.ok(open.endsWith('0.0 100.0'));
  assert.equal(open.split('C').length - 1, 3);
  const closed: string = smoothPath(square, true);
  assert.ok(closed.endsWith('Z'));
  assert.equal(closed.split('C').length - 1, 4);
  assert.equal(smoothPath([{ x: 1, y: 1 }], false), '');
});

void test('roughening keeps the given points and adds jittered ones between them', (): void => {
  const rough: Spot[] = roughen(square, true, seeded(3), 0.2, 2);
  assert.equal(rough.length, 16);
  assert.deepEqual(rough[0], square[0]);
  assert.deepEqual(rough[4], square[1]);
  const line: Spot[] = roughen(square, false, seeded(3), 0.2, 1);
  assert.equal(line.length, 7);
  assert.deepEqual(line[6], square[3]);
});

void test('scattered marks stay inside their region and marks along a line keep their spacing', (): void => {
  assert.ok(inside(square, { x: 50, y: 50 }));
  assert.ok(!inside(square, { x: 150, y: 50 }));
  const marks: Spot[] = scatter(square, 10, seeded(5));
  assert.ok(marks.length > 50);
  assert.ok(marks.every((mark: Spot): boolean => inside(square, mark)));
  const steps: Spot[] = along([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }], 25);
  assert.deepEqual(steps.map((step: Spot): string => `${step.x},${step.y}`), ['0,0', '25,0', '50,0', '75,0', '100,0', '100,25', '100,50']);
});
