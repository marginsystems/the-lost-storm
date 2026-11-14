import assert from 'node:assert/strict';
import { test } from 'node:test';
import { atRest, ATLAS_VIEW, clampView, coverScale, markerScale, maxScale, minScale, openScale, openView, panBy, pinchTo, placeBox, settleView, still, stepMotion, toMap, toScreen, zoomAt } from './atlas-view.ts';
import type { AtlasBox, AtlasMotion, AtlasView, MapFrame, Pinch, ScreenPoint } from './atlas-view.ts';

const PLACES: readonly ScreenPoint[] = [
  { x: 380, y: 470 },
  { x: 790, y: 560 },
  { x: 1200, y: 470 },
];
const BOX: AtlasBox = placeBox(PLACES, 1600, 1000);
const sized = (width: number, height: number): MapFrame => ({ width, height, mapWidth: 1600, mapHeight: 1000, places: BOX });
const frame: MapFrame = sized(800, 600);
const WINDOWS: readonly MapFrame[] = [sized(2000, 1060), sized(1440, 900), sized(844, 390), sized(390, 844), sized(800, 600), sized(3840, 2160)];
const CLOSE: number = 1e-6;

void test('the place box wraps every place with room for its marker and name, and an empty act frames the whole sheet', (): void => {
  const reach = ATLAS_VIEW.placeReach;
  assert.deepEqual(BOX, { left: 380 - reach.side, top: 470 - reach.above, right: 1200 + reach.side, bottom: 560 + reach.below });
  assert.deepEqual(placeBox([], 1600, 1000), { left: 0, top: 0, right: 1600, bottom: 1000 });
});

void test('the map opens on every window with all places inside the margin, and never closer than the ceiling', (): void => {
  for (const window of WINDOWS) {
    const opened: AtlasView = openView(window);
    assert.ok(opened.scale <= ATLAS_VIEW.openCeiling + CLOSE, `${window.width}x${window.height} opens at ${opened.scale}`);
    assert.ok(opened.scale >= minScale(window) - CLOSE && opened.scale <= maxScale(window));
    const marginX: number = window.width * ATLAS_VIEW.openMargin - CLOSE;
    const marginY: number = window.height * ATLAS_VIEW.openMargin - CLOSE;
    const topLeft: ScreenPoint = toScreen(opened, window, { x: BOX.left, y: BOX.top });
    const bottomRight: ScreenPoint = toScreen(opened, window, { x: BOX.right, y: BOX.bottom });
    assert.ok(topLeft.x >= marginX && topLeft.y >= marginY, `${window.width}x${window.height} cuts the top left`);
    assert.ok(bottomRight.x <= window.width - marginX && bottomRight.y <= window.height - marginY, `${window.width}x${window.height} cuts the bottom right`);
  }
});

void test('the opening scale follows the window and the places, not one fixed number', (): void => {
  assert.equal(openScale(sized(2000, 1060)), ATLAS_VIEW.openCeiling);
  assert.equal(openScale(sized(1440, 900)), ATLAS_VIEW.openCeiling);
  const phone: number = openScale(sized(844, 390));
  assert.ok(Math.abs(phone - (844 * (1 - 2 * ATLAS_VIEW.openMargin)) / (BOX.right - BOX.left)) < CLOSE);
  assert.ok(openScale(sized(390, 844)) < phone);
  const near: MapFrame = { ...sized(2000, 1060), places: placeBox([{ x: 800, y: 500 }], 1600, 1000) };
  assert.equal(openScale(near), ATLAS_VIEW.openCeiling);
  assert.ok(openScale(sized(2000, 1060)) < coverScale(sized(2000, 1060)));
});

void test('the map opens further out than the sheet that covers the window, and settles out to it from a slightly closer view', (): void => {
  const wide: MapFrame = sized(2000, 1060);
  const opened: AtlasView = openView(wide);
  assert.ok(opened.scale < 1.25);
  assert.equal(minScale(wide), opened.scale);
  const settling: AtlasView = settleView(opened, wide);
  assert.ok(settling.scale > opened.scale && settling.scale < maxScale(wide));
  assert.ok(Math.abs(opened.x - (BOX.left + BOX.right) / 2) < CLOSE);
});

void test('a sheet smaller than the window stays wholly on screen when panned', (): void => {
  const wide: MapFrame = sized(2000, 1060);
  const opened: AtlasView = openView(wide);
  for (const [dx, dy] of [[1e6, 1e6], [-1e6, -1e6]] as const) {
    const moved: AtlasView = panBy(opened, wide, dx, dy);
    const corner: ScreenPoint = toScreen(moved, wide, { x: 0, y: 0 });
    const far: ScreenPoint = toScreen(moved, wide, { x: 1600, y: 1000 });
    assert.ok(corner.x >= -CLOSE && corner.y >= -CLOSE && far.x <= wide.width + CLOSE && far.y <= wide.height + CLOSE);
  }
  const covered: AtlasView = clampView({ x: -500, y: 9000, scale: coverScale(frame) }, frame);
  assert.ok(Math.abs(toScreen(covered, frame, { x: 0, y: 0 }).x) < CLOSE);
  assert.ok(Math.abs(toScreen(covered, frame, { x: 0, y: 1000 }).y - frame.height) < CLOSE);
});

void test('place markers keep a readable size when a narrow window fits the whole act', (): void => {
  assert.equal(markerScale(ATLAS_VIEW.openCeiling), 1);
  const portrait: number = openView(sized(390, 844)).scale;
  assert.ok(Math.abs(portrait * markerScale(portrait) - ATLAS_VIEW.markerFloor) < CLOSE);
});

void test('zooming keeps the point under the cursor where it is', (): void => {
  const view: AtlasView = openView(frame);
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
  const view: AtlasView = openView(frame);
  const dragged: AtlasView = panBy(view, frame, 50, -20);
  const before: ScreenPoint = toScreen(view, frame, { x: 800, y: 500 });
  assert.ok(Math.abs(toScreen(dragged, frame, { x: 800, y: 500 }).x - (before.x + 50)) < CLOSE);
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
  const view: AtlasView = openView(frame);
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
