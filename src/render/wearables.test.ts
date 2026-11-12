import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cornerMask, maskHidden, partMasks } from './wearables.ts';

const PARTS: readonly string[] = ['head', 'torso', 'arms', 'hands', 'legs', 'feet'];

void test('every mix of parts has its own group', (): void => {
  assert.equal(partMasks(PARTS.length), 64);
  assert.equal(cornerMask([1, 1, 1]), 2);
  assert.equal(cornerMask([1, 1, 4]), 18);
});

void test('a triangle touching skin that belongs to no part is never hidden', (): void => {
  assert.equal(cornerMask([1, 1, -1]), 0);
  assert.equal(maskHidden(0, PARTS, PARTS), false);
});

void test('a neck triangle between torso and head stays while the head shows, so a coat cuts no teeth into the neck', (): void => {
  const neck: number = cornerMask([1, 1, 0]);
  assert.equal(maskHidden(neck, PARTS, ['torso', 'arms']), false);
  assert.equal(maskHidden(neck, PARTS, ['head', 'torso']), true);
});

void test('a waist triangle between torso and legs hides when both are covered', (): void => {
  const waist: number = cornerMask([1, 4, 4]);
  assert.equal(maskHidden(waist, PARTS, ['torso', 'arms', 'legs']), true);
  assert.equal(maskHidden(waist, PARTS, ['torso']), false);
});
