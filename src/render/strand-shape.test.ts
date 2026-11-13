import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { StrandBuffers, StrandEnds } from './strand-shape.ts';
import { createDice, createStrandBuffers, STRAND, STRAND_POINTS, strandLight, strandSpan, strandStrips, writeStrand } from './strand-shape.ts';

const FROM: StrandEnds = { x: 1, y: 1.4, z: 2 };
const TO: StrandEnds = { x: 7, y: 1.1, z: -3 };

function pointAt(buffers: StrandBuffers, index: number): StrandEnds {
  return { x: buffers.points[index * 3] ?? Number.NaN, y: buffers.points[index * 3 + 1] ?? Number.NaN, z: buffers.points[index * 3 + 2] ?? Number.NaN };
}

function near(actual: StrandEnds, expected: StrandEnds): void {
  assert.ok(Math.abs(actual.x - expected.x) < 1e-6 && Math.abs(actual.y - expected.y) < 1e-6 && Math.abs(actual.z - expected.z) < 1e-6, `${JSON.stringify(actual)} is not ${JSON.stringify(expected)}`);
}

void test('a strand starts and ends exactly at its ends, with every point finite and every weight between nothing and full', (): void => {
  const dice = createDice();
  dice.reset(0.42);
  const buffers: StrandBuffers = createStrandBuffers();
  writeStrand(FROM, TO, { forks: 2, jitter: 0.8 }, dice.next, buffers);
  near(pointAt(buffers, 0), FROM);
  const steps: number = Math.min(STRAND.trunkPoints - 1, Math.ceil(Math.hypot(6, 0.3, 5) / STRAND.step));
  near(pointAt(buffers, steps), TO);
  for (const value of buffers.points) assert.ok(Number.isFinite(value));
  for (const weight of buffers.weights) assert.ok(weight >= 0 && weight <= 1);
});

void test('a strand never draws more forks than the kit holds, and an undrawn fork or unused trunk point has no weight', (): void => {
  const buffers: StrandBuffers = createStrandBuffers();
  const dice = createDice();
  dice.reset(0.7);
  assert.equal(writeStrand(FROM, TO, { forks: 9, jitter: 0.5 }, dice.next, buffers), STRAND.maxForks);
  assert.equal(writeStrand(FROM, TO, { forks: 0, jitter: 0.5 }, dice.next, buffers), 0);
  for (let index: number = STRAND.trunkPoints; index < STRAND_POINTS; index += 1) assert.equal(buffers.weights[index], 0);
  writeStrand(FROM, { x: 1.5, y: 1.4, z: 2 }, { forks: 1, jitter: 0.5 }, dice.next, buffers);
  assert.equal(buffers.weights[STRAND.trunkPoints - 1], 0);
  assert.ok((buffers.weights[STRAND.trunkPoints] ?? 0) > 0);
  assert.equal(buffers.weights[STRAND.trunkPoints + STRAND.forkPoints - 1], 0);
});

void test('a long strand still fits its fixed buffer', (): void => {
  const buffers: StrandBuffers = createStrandBuffers();
  writeStrand(FROM, { x: 80, y: 1, z: 80 }, { forks: 2, jitter: 1 }, createDice().next, buffers);
  near(pointAt(buffers, STRAND.trunkPoints - 1), { x: 80, y: 1, z: 80 });
  assert.equal(buffers.points.length, STRAND_POINTS * 3);
  assert.equal(strandStrips().reduce((sum: number, [, count]: readonly [number, number]): number => sum + count, 0), STRAND_POINTS);
});

void test('the same dice roll gives the same shape, so a moving strand only crackles when its seed changes', (): void => {
  const dice = createDice();
  const first: StrandBuffers = createStrandBuffers();
  const again: StrandBuffers = createStrandBuffers();
  dice.reset(0.3);
  writeStrand(FROM, TO, { forks: 1, jitter: 0.6 }, dice.next, first);
  dice.reset(0.3);
  writeStrand(FROM, TO, { forks: 1, jitter: 0.6 }, dice.next, again);
  assert.deepEqual(again.points, first.points);
  dice.reset(0.9);
  writeStrand(FROM, TO, { forks: 1, jitter: 0.6 }, dice.next, again);
  assert.notDeepEqual(again.points, first.points);
});

void test('a strike eases in over a few frames, peaks, and fades to nothing by the end of its span', (): void => {
  for (const restrike of [true, false]) {
    assert.equal(strandLight(0, 0.25, restrike), 0);
    assert.ok(strandLight(1 / 60, 0.25, restrike) < 0.5);
    assert.ok(strandLight(STRAND.lead, 0.25, restrike) > 0.95);
    assert.equal(strandLight(strandSpan(0.25), 0.25, restrike), 0);
    assert.ok(strandLight(strandSpan(0.25) - 1 / 120, 0.25, restrike) < 0.02);
    for (let age: number = 0; age < 1; age += 0.005) {
      const light: number = strandLight(age, 0.25, restrike);
      assert.ok(light >= 0 && light <= 1);
    }
  }
  let last: number = strandLight(STRAND.lead, 0.25, false);
  for (let age: number = STRAND.lead; age < strandSpan(0.25); age += 0.005) {
    const light: number = strandLight(age, 0.25, false);
    assert.ok(light <= last + 1e-9);
    last = light;
  }
});
