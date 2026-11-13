import assert from 'node:assert/strict';
import { test } from 'node:test';
import { atRest, ATLAS_VIEW, clampView, maxScale, minScale, openView, panBy, pinchTo, settleView, still, stepMotion, toMap, toScreen, zoomAt } from './atlas-view.ts';
import type { AtlasFrame, AtlasMotion, AtlasView, Pinch, ScreenPoint } from './atlas-view.ts';

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

void test('the map opens at its smallest scale, with the current place on screen, and settles out to it from a slightly closer view', (): void => {
  const opened: AtlasView = openView(frame, 360, 540);
  assert.equal(opened.scale, minScale(frame));
  const settling: AtlasView = settleView(opened, frame);
  assert.ok(settling.scale > opened.scale && settling.scale < maxScale(frame));
  const phone: AtlasFrame = { width: 390, height: 844, mapWidth: 1600, mapHeight: 1000 };
  const onPhone: AtlasView = openView(phone, 360, 540);
  assert.equal(onPhone.scale, minScale(phone));
  assert.ok(onPhone.scale >= 11 / 14);
  const place: ScreenPoint = toScreen(onPhone, phone, { x: 360, y: 540 });
  assert.ok(place.x >= 0 && place.x <= phone.width && place.y >= 0 && place.y <= phone.height);
  const wide: AtlasFrame = { width: 2000, height: 1160, mapWidth: 1600, mapHeight: 1000 };
  const desktop: AtlasView = openView(wide, 360, 540);
  assert.equal(desktop.scale, 1.25);
  assert.equal(desktop.x, 800);
  const spot: ScreenPoint = toScreen(desktop, wide, { x: 360, y: 540 });
  assert.ok(spot.x >= 0 && spot.x <= wide.width && spot.y >= 0 && spot.y <= wide.height);
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

void test('spreading two fingers zooms by their ratio and keeps the map under their midpoint', (): void => {
  const view: AtlasView = openView(frame, 800, 500);
  const from: Pinch = { a: { x: 350, y: 300 }, b: { x: 450, y: 300 } };
  const to: Pinch = { a: { x: 330, y: 310 }, b: { x: 470, y: 310 } };
  const held: ScreenPoint = toMap(view, frame, { x: 400, y: 300 });
  const pinched: AtlasView = pinchTo(view, frame, from, to);
  assert.ok(Math.abs(pinched.scale - Math.min(maxScale(frame), view.scale * 1.4)) < CLOSE);
  const after: ScreenPoint = toScreen(pinched, frame, held);
  assert.ok(Math.abs(after.x - 400) < CLOSE && Math.abs(after.y - 310) < CLOSE);
  assert.equal(pinchTo(view, frame, from, { a: { x: 399, y: 300 }, b: { x: 401, y: 300 } }).scale, minScale(frame));
  assert.equal(pinchTo(view, frame, from, { a: from.a, b: from.a }).scale, view.scale);
});
