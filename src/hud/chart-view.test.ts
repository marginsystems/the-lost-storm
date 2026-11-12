import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AtlasFrame, AtlasView } from './atlas-view.ts';
import { CHART_VIEW, clampChart, fitScale, frameChart, openChart, panChart, pinLabel, spreadLabels, wholeChart, zoomChart } from './chart-view.ts';
import type { LabelBox, PinnedLabel } from './chart-view.ts';

const FRAME: AtlasFrame = { width: 1400, height: 700, mapWidth: 1500, mapHeight: 1400 };

void test('zooming all the way out shows the whole chart inside the frame, centred', (): void => {
  const whole: AtlasView = wholeChart(FRAME);
  assert.ok(whole.scale * FRAME.mapWidth <= FRAME.width);
  assert.ok(whole.scale * FRAME.mapHeight <= FRAME.height);
  assert.equal(whole.x, FRAME.mapWidth / 2);
  assert.equal(whole.y, FRAME.mapHeight / 2);
  assert.equal(zoomChart(whole, FRAME, { x: 700, y: 350 }, 99999).scale, fitScale(FRAME));
});

void test('the chart opens at a readable zoom on the place asked for, and never past its edge', (): void => {
  const open: AtlasView = openChart(FRAME, { x: 750, y: 700 });
  assert.equal(open.scale, CHART_VIEW.openScale);
  assert.deepEqual({ x: open.x, y: open.y }, { x: 750, y: 700 });
  const corner: AtlasView = openChart(FRAME, { x: 0, y: 0 });
  assert.ok(corner.y >= FRAME.height / (2 * corner.scale) - 1e-9);
  assert.equal(corner.x, FRAME.mapWidth / 2);
});

void test('a pan on a chart smaller than the frame keeps it centred', (): void => {
  const small: AtlasFrame = { width: 2000, height: 1600, mapWidth: 1500, mapHeight: 1400 };
  const view: AtlasView = clampChart({ x: 750, y: 700, scale: fitScale(small) }, small);
  assert.deepEqual(panChart(view, small, 300, -200), view);
});

void test('a path name off the screen is pinned whole to the nearest edge, and one on screen stays where it is', (): void => {
  const inside: PinnedLabel = pinLabel({ x: 600, y: 300 }, 80, 10, FRAME);
  assert.deepEqual(inside, { x: 600, y: 300, pinned: false });
  const left: PinnedLabel = pinLabel({ x: -400, y: 300 }, 80, 10, FRAME);
  assert.deepEqual(left, { x: 80 + CHART_VIEW.labelEdge, y: 300, pinned: true });
  const corner: PinnedLabel = pinLabel({ x: 2000, y: 900 }, 80, 10, FRAME);
  assert.equal(corner.x + 80, FRAME.width - CHART_VIEW.labelEdge);
  assert.equal(corner.y + 10, FRAME.height - CHART_VIEW.labelEdge);
});

void test('two names pinned onto the same spot are spread apart toward the middle, and apart names stay put', (): void => {
  const low: LabelBox = { x: 300, y: 680, halfWidth: 120, halfHeight: 10 };
  const [first, second] = spreadLabels([low, { ...low, x: 380 }], FRAME);
  assert.deepEqual(first, low);
  assert.equal(second?.y, 680 - 20 - CHART_VIEW.labelGap);
  const apart: LabelBox[] = spreadLabels([low, { ...low, x: 1100 }], FRAME);
  assert.equal(apart[1]?.y, 680);
});

void test('the chart opens framed on every place that can be taken, at no more than the readable zoom', (): void => {
  const spread: AtlasView = frameChart(FRAME, [{ x: 300, y: 300 }, { x: 1200, y: 1100 }]);
  assert.ok(spread.scale < CHART_VIEW.openScale);
  assert.ok((1200 - 300 + CHART_VIEW.framePad * 2) * spread.scale <= FRAME.width);
  assert.ok((1100 - 300 + CHART_VIEW.framePad * 2) * spread.scale <= FRAME.height);
  assert.equal(spread.x, 750);
  assert.equal(spread.y, 700);
  assert.equal(frameChart(FRAME, [{ x: 750, y: 700 }]).scale, CHART_VIEW.openScale);
  assert.deepEqual(frameChart(FRAME, []), wholeChart(FRAME));
});
