import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ContentError } from './read.ts';
import { zoneScatter } from './parse-scatter.ts';

const OPEN = { type: 'open', props: ['pebble'], count: 40, clump: 3, spread: 0.8, size: { least: 0.5, most: 1.2 }, clear: 0.3 } as const;
const AROUND = { type: 'around', props: ['chip'], anchors: ['wall'], each: 4, spread: 1.5, size: { least: 0.8, most: 1 } } as const;

void test('scatter reads open ground cover and cover heaped around named props', (): void => {
  assert.deepEqual(zoneScatter(OPEN, 'zone.scatter[0]'), OPEN);
  assert.deepEqual(zoneScatter(AROUND, 'zone.scatter[1]'), AROUND);
});

void test('scatter needs a prop, a known type and a size range that runs upwards', (): void => {
  assert.throws(() => zoneScatter({ ...OPEN, props: [] }, 'zone.scatter[0]'), ContentError);
  assert.throws(() => zoneScatter({ ...OPEN, type: 'heaped' }, 'zone.scatter[0]'), ContentError);
  assert.throws(() => zoneScatter({ ...OPEN, size: { least: 1.2, most: 0.5 } }, 'zone.scatter[0]'), ContentError);
  assert.throws(() => zoneScatter({ ...AROUND, spread: 0 }, 'zone.scatter[1]'), ContentError);
  assert.throws(() => zoneScatter({ ...OPEN, clump: 0 }, 'zone.scatter[0]'), ContentError);
});
