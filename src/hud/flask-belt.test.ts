import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flaskUses } from './flask-belt.ts';

void test('a full flask counts every whole use it holds', (): void => {
  assert.equal(flaskUses({ charges: 30, chargesPerUse: 10 }), 3);
});

void test('a part-filled use does not count until it is whole', (): void => {
  assert.equal(flaskUses({ charges: 13, chargesPerUse: 10 }), 1);
  assert.equal(flaskUses({ charges: 9.99, chargesPerUse: 10 }), 0);
});

void test('an empty flask counts zero', (): void => {
  assert.equal(flaskUses({ charges: 0, chargesPerUse: 8 }), 0);
});

void test('a flask with no cost per use counts zero rather than dividing by it', (): void => {
  assert.equal(flaskUses({ charges: 30, chargesPerUse: 0 }), 0);
});
