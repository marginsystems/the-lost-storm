import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HEAD_TAG, headTagRect, headTagSeen } from './head-tag.ts';
import type { HeadSpot } from './head-tag.ts';
import { LABEL_EDGE } from './label-edge.ts';
import type { ViewSize } from './label-edge.ts';

const VIEW: ViewSize = { width: 1280, height: 800 };

function at(x: number, y: number, front: boolean = true): HeadSpot {
  return { x, y, front };
}

void test('a head in the middle of the view is seen whether or not it was before', (): void => {
  assert.equal(headTagSeen(at(640, 400), VIEW, true), true);
  assert.equal(headTagSeen(at(640, 400), VIEW, false), true);
});

void test('a head past any edge is not seen', (): void => {
  assert.equal(headTagSeen(at(-1, 400), VIEW, true), false);
  assert.equal(headTagSeen(at(VIEW.width + 1, 400), VIEW, true), false);
  assert.equal(headTagSeen(at(640, VIEW.height + 1), VIEW, true), false);
  assert.equal(headTagSeen(at(640, LABEL_EDGE.top - 1), VIEW, true), false);
});

void test('a head behind the camera is never seen', (): void => {
  assert.equal(headTagSeen(at(640, 400, false), VIEW, true), false);
  assert.equal(headTagSeen(at(640, 400, false), VIEW, false), false);
});

void test('a tag that is shown stays shown until the head crosses the edge', (): void => {
  assert.equal(headTagSeen(at(HEAD_TAG.enterInset - 1, 400), VIEW, true), true);
  assert.equal(headTagSeen(at(0, 400), VIEW, true), true);
  assert.equal(headTagSeen(at(-0.5, 400), VIEW, true), false);
});

void test('a hidden tag only returns once the head is well inside the view', (): void => {
  assert.equal(headTagSeen(at(HEAD_TAG.enterInset - 1, 400), VIEW, false), false);
  assert.equal(headTagSeen(at(HEAD_TAG.enterInset, 400), VIEW, false), true);
  assert.equal(headTagSeen(at(VIEW.width - HEAD_TAG.enterInset + 1, 400), VIEW, false), false);
  assert.equal(headTagSeen(at(640, LABEL_EDGE.top + HEAD_TAG.enterInset - 1), VIEW, false), false);
  assert.equal(headTagSeen(at(640, VIEW.height - HEAD_TAG.enterInset + 1), VIEW, false), false);
});

void test('a head hovering on the edge does not flicker', (): void => {
  let was: boolean = true;
  let flips: number = 0;
  for (const x of [3, 9, 4, 10, 5, 7, 6, 2]) {
    const next: boolean = headTagSeen(at(x, 400), VIEW, was);
    if (next !== was) flips += 1;
    was = next;
  }
  assert.equal(flips, 0);
});

void test('the rect of a tag stands on its head and is centred on it', (): void => {
  assert.deepEqual(headTagRect(100, 200, 60, 20), { left: 70, top: 180, right: 130, bottom: 200 });
});
