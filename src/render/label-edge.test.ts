import assert from 'node:assert/strict';
import { test } from 'node:test';
import { anchorInView, LABEL_EDGE } from './label-edge.ts';

const VIEW = { width: 844, height: 390 };

void test('an exit label whose anchor sits in the view, below the top band, is shown', (): void => {
  assert.equal(anchorInView(400, 200, VIEW), true);
  assert.equal(anchorInView(400, LABEL_EDGE.top, VIEW), true);
});

void test('an exit label that would only peek in at an edge is hidden', (): void => {
  assert.equal(anchorInView(400, LABEL_EDGE.top - 1, VIEW), false);
  assert.equal(anchorInView(400, -20, VIEW), false);
  assert.equal(anchorInView(-5, 200, VIEW), false);
  assert.equal(anchorInView(900, 200, VIEW), false);
  assert.equal(anchorInView(400, 400, VIEW), false);
});
