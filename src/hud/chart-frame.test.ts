import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AtlasFrame, AtlasView } from './atlas-view.ts';
import { boardTransform, labelTransform, writeView } from './chart-frame.ts';
import type { FrameLabel, FrameTargets } from './chart-frame.ts';

const FRAME: AtlasFrame = { width: 1400, height: 700, mapWidth: 1500, mapHeight: 1400 };

interface Writes {
  readonly board: string[];
  readonly here: number[];
  readonly labels: { readonly transform: string; readonly pinned: boolean }[][];
}

function recording(): { readonly targets: FrameTargets; readonly writes: Writes } {
  const writes: Writes = { board: [], here: [], labels: [[], []] };
  const labels: FrameLabel[] = [
    { at: { x: 300, y: 300 }, halfWidth: 60, halfHeight: 10, place: (transform: string, pinned: boolean): void => void writes.labels[0]?.push({ transform, pinned }) },
    { at: { x: 1200, y: 1100 }, halfWidth: 60, halfHeight: 10, place: (transform: string, pinned: boolean): void => void writes.labels[1]?.push({ transform, pinned }) },
  ];
  return {
    writes,
    targets: {
      labels,
      moveBoard: (transform: string): void => void writes.board.push(transform),
      zoomHere: (scale: number): void => void writes.here.push(scale),
    },
  };
}

void test('a zoom step writes the board transform, the here-word scale and one transform per path name, and nothing else', (): void => {
  const { targets, writes } = recording();
  const view: AtlasView = { x: 750, y: 700, scale: 1.4 };
  writeView(targets, view, FRAME, 52);
  assert.deepEqual(writes.board, [boardTransform(view, FRAME)]);
  assert.deepEqual(writes.here, [1.4]);
  assert.deepEqual(
    writes.labels.map((entries) => entries.length),
    [1, 1],
  );
  assert.equal(Object.keys(targets).toSorted().join(), 'labels,moveBoard,zoomHere');
});

void test('the board transform is one translate and one scale of the view', (): void => {
  const view: AtlasView = { x: 750, y: 700, scale: 2 };
  assert.equal(boardTransform(view, FRAME), 'translate(-800px, -1050px) scale(2)');
});

void test('a path name is placed at whole pixels and flagged pinned only when it was pushed back inside the frame', (): void => {
  const { targets, writes } = recording();
  writeView(targets, { x: 750, y: 700, scale: 1 }, FRAME, 52);
  const first = writes.labels[0]?.[0];
  assert.ok(first !== undefined);
  assert.match(first.transform, /^translate\(-?\d+px, -?\d+px\) translate\(-50%, -50%\)$/);
  assert.equal(labelTransform({ x: 10.4, y: 20.6, halfWidth: 1, halfHeight: 1 }), 'translate(10px, 21px) translate(-50%, -50%)');
  const far = writes.labels[1]?.[0];
  assert.ok(far !== undefined);
  assert.equal(far.pinned, true);
});
