import assert from 'node:assert/strict';
import { test } from 'node:test';
import { atRest, ATLAS_VIEW, clampView, maxScale, minScale, openView, panBy, still, stepMotion, toMap, toScreen, zoomAt } from './atlas-view.ts';
import type { AtlasFrame, AtlasMotion, AtlasView, ScreenPoint } from './atlas-view.ts';

const frame: AtlasFrame = { width: 800, height: 600, mapWidth: 1600, mapHeight: 1000 };
const CLOSE: number = 1e-6;

void test('the map always covers the window: the smallest zoom fits the tighter side and the view cannot leave the sheet', (): void => {
  assert.equal(minScale(frame), 0.6);
  assert.equal(maxScale(frame), 0.6 * ATLAS_VIEW.zoomRange);
  const far: AtlasView = clampView({ x: -500, y: 9000, scale: 0.1 }, frame);
  assert.equal(far.scale, 0.6);
  assert.ok(Math.abs(far.x - 400 / 0.6) < CLOSE);
  assert.equal(far.y, 500);
  assert.equal(clampView({ x: 800, y: 500, scale: 99 }, frame).scale, maxScale(frame));
});

void test('zooming keeps the point under the cursor where it is', (): void => {
  const view: AtlasView = openView(frame, 800, 500);
  const cursor: ScreenPoint = { x: 520, y: 340 };
  const held: ScreenPoint = toMap(view, frame, cursor);
  const zoomed: AtlasView = zoomAt(view, frame, cursor, -300);
  assert.ok(zoomed.scale > view.scale);
  const after: ScreenPoint = toScreen(zoomed, frame, held);
  assert.ok(Math.abs(after.x - cursor.x) < CLOSE && Math.abs(after.y - cursor.y) < CLOSE);
  assert.equal(zoomAt(view, frame, cursor, 1e6).scale, minScale(frame));
  assert.equal(zoomAt(view, frame, cursor, -1e6).scale, maxScale(frame));
});

void test('dragging moves the sheet with the pointer and stops at its edge', (): void => {
  const view: AtlasView = openView(frame, 800, 500);
  const dragged: AtlasView = panBy(view, frame, 50, -20);
  assert.ok(Math.abs(toScreen(dragged, frame, { x: 800, y: 500 }).x - 450) < CLOSE);
  const pinned: AtlasView = panBy(view, frame, 1e6, 1e6);
  assert.ok(Math.abs(toScreen(pinned, frame, { x: 0, y: 0 }).x) < CLOSE);
});

void test('the view springs to its target and comes to rest there', (): void => {
  const target: AtlasView = { x: 900, y: 450, scale: 1.4 };
  let motion: AtlasMotion = still({ x: 700, y: 500, scale: 0.8 });
  const first: AtlasMotion = stepMotion(motion, target, 1 / 60);
  assert.ok(first.view.x > 700 && first.view.x < 900);
  for (let frames: number = 0; frames < 240; frames += 1) motion = stepMotion(motion, target, 1 / 60);
  assert.deepEqual(motion.view, target);
  assert.ok(atRest(motion, target));
  assert.deepEqual(stepMotion(motion, target, 5).view, target);
});
