import assert from 'node:assert/strict';
import { test } from 'node:test';
import { anchorInView, keepBelowTop, keepInside, LABEL_EDGE } from './label-edge.ts';

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

void test('a ground tag past either side slides back inside the view, and a tag wider than the view centres', (): void => {
  const phone = { width: 390, height: 844 };
  assert.equal(keepInside(432, 66, phone), 390 - LABEL_EDGE.side - 33);
  assert.equal(keepInside(-20, 66, phone), LABEL_EDGE.side + 33);
  assert.equal(keepInside(200, 66, phone), 200);
  assert.equal(keepInside(50, 500, phone), 195);
});

void test('a ground tag above the top or below the bottom slides back so all of it shows', (): void => {
  const phone = { width: 390, height: 844 };
  assert.equal(keepBelowTop(-32, 20, phone), LABEL_EDGE.side + 20);
  assert.equal(keepBelowTop(900, 20, phone), 844 - LABEL_EDGE.side);
  assert.equal(keepBelowTop(400, 20, phone), 400);
});
