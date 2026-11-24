import assert from 'node:assert/strict';
import { test } from 'node:test';
import { propSeat } from './parse-cache.ts';
import { ContentError } from './read.ts';

void test('a prop with no seat has none', (): void => {
  assert.equal(propSeat(undefined, 'props[0].seat'), null);
  assert.equal(propSeat(null, 'props[0].seat'), null);
});

void test('a seat reads where the sitter stands from the prop and which way they face', (): void => {
  assert.deepEqual(propSeat({ x: 0.1, z: 0.33, facingDegrees: 180 }, 'props[0].seat'), { x: 0.1, z: 0.33, facingDegrees: 180 });
});

void test('a seat needs every number', (): void => {
  assert.throws((): unknown => propSeat({ x: 0, z: 0.33 }, 'props[0].seat'), ContentError);
  assert.throws((): unknown => propSeat({ x: '0', z: 0.33, facingDegrees: 0 }, 'props[0].seat'), ContentError);
  assert.throws((): unknown => propSeat(4, 'props[0].seat'), ContentError);
});
