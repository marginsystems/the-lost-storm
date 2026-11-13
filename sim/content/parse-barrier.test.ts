import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ContentError } from './read.ts';
import { zoneBarrier } from './parse-barrier.ts';

const ROW = { far: { props: ['crag'], out: -0.9, step: 2.6, turn: 70 }, near: { props: ['low'], out: -0.6, step: 1.1, turn: 90 }, collide: true, shadow: true } as const;
const BARRIER = { nearSides: ['south', 'east'], exitClear: 3, rows: [ROW, { ...ROW, near: { ...ROW.near, props: [] }, collide: false, shadow: false }] } as const;

void test('a barrier reads its rows, its camera-side edges and the room it leaves at exits', (): void => {
  assert.deepEqual(zoneBarrier(BARRIER, 'zone.outside.barrier'), BARRIER);
  assert.equal(zoneBarrier(undefined, 'zone.outside.barrier'), null);
  assert.equal(zoneBarrier(null, 'zone.outside.barrier'), null);
});

void test('a barrier needs rows with rocks, real sides and steps that move along the edge', (): void => {
  assert.throws(() => zoneBarrier({ ...BARRIER, rows: [] }, 'zone.outside.barrier'), ContentError);
  assert.throws(() => zoneBarrier({ ...BARRIER, nearSides: ['up'] }, 'zone.outside.barrier'), ContentError);
  assert.throws(() => zoneBarrier({ ...BARRIER, rows: [{ ...ROW, far: { ...ROW.far, props: [] }, near: { ...ROW.near, props: [] } }] }, 'zone.outside.barrier'), ContentError);
  assert.throws(() => zoneBarrier({ ...BARRIER, rows: [{ ...ROW, far: { ...ROW.far, step: 0 } }] }, 'zone.outside.barrier'), ContentError);
  assert.throws(() => zoneBarrier({ ...BARRIER, exitClear: -1 }, 'zone.outside.barrier'), ContentError);
});
