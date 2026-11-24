import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Object3D } from 'three';
import { createHeadFollow, followHead, HEAD_TOP, headReader, headRise, measureHeadTop } from './head-top.ts';

interface Body {
  readonly root: Object3D;
  readonly head: Object3D;
}

function body(headAt: number, scale: number): Body {
  const root: Object3D = new Object3D();
  const hips: Object3D = new Object3D();
  const head: Object3D = new Object3D();
  hips.position.y = headAt / 2;
  head.position.y = headAt / 2;
  root.add(hips);
  hips.add(head);
  root.scale.setScalar(scale);
  return { root, head };
}

void test('a standing body is labelled at its own height, and a seated one at its lowered head', (): void => {
  const { root, head } = body(1.6, 1);
  const top = measureHeadTop(root, head, 1.85);
  assert.ok(Math.abs(top.crown - 0.25) < 1e-9);
  assert.ok(Math.abs(headRise(top, root, 1.85) - 1.85) < 1e-9);
  head.position.y -= 0.5;
  assert.ok(Math.abs(headRise(top, root, 1.85) - 1.35) < 1e-9);
});

void test('the head top follows the body where it stands and at its scale', (): void => {
  const { root, head } = body(1.6, 1.2);
  root.position.y = 3;
  const top = measureHeadTop(root, head, 1.85 * 1.2);
  assert.ok(Math.abs(headRise(top, root, 1.85 * 1.2) - 1.85 * 1.2) < 1e-9);
});

void test('a rig whose height is far from its head keeps the crown within a head', (): void => {
  const tall = body(0.5, 1);
  assert.ok(Math.abs(measureHeadTop(tall.root, tall.head, 2).crown - 2 * HEAD_TOP.maxCrown) < 1e-9);
  const short = body(2.4, 1);
  assert.ok(Math.abs(measureHeadTop(short.root, short.head, 2).crown - 2 * HEAD_TOP.minCrown) < 1e-9);
});

void test('a body with no head bone is labelled at its height', (): void => {
  const root: Object3D = new Object3D();
  root.position.y = 4;
  assert.equal(headRise(measureHeadTop(root, null, 1.7), root, 1.7), 1.7);
});

void test('the label height eases to a new head height without a jump and settles on it', (): void => {
  const follow = createHeadFollow();
  assert.equal(followHead(follow, 2.2, 1 / 60), 2.2);
  let last: number = 2.2;
  let biggest: number = 0;
  for (let frame: number = 0; frame < 120; frame += 1) {
    const rise: number = followHead(follow, 1.6, 1 / 60);
    biggest = Math.max(biggest, Math.abs(rise - last));
    assert.ok(rise <= last + 1e-9 && rise >= 1.6 - 1e-9);
    last = rise;
  }
  assert.ok(biggest < 0.1);
  assert.equal(last, 1.6);
  assert.equal(followHead(follow, 1.6, 0), 1.6);
});

void test('a body read while it sits down lowers its label smoothly to the seated head', (): void => {
  const { root, head } = body(1.6, 1);
  const read = headReader(root, head, 1.85);
  assert.ok(Math.abs(read(1 / 60) - 1.85) < 1e-9);
  head.position.y -= 0.5;
  const first: number = read(1 / 60);
  assert.ok(first < 1.85 && first > 1.6);
  let settled: number = first;
  for (let frame: number = 0; frame < 120; frame += 1) settled = read(1 / 60);
  assert.ok(Math.abs(settled - 1.35) < 1e-9);
});
