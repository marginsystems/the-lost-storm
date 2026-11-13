import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toMap, toScreen } from './atlas-view.ts';
import type { AtlasFrame, AtlasView, ScreenPoint } from './atlas-view.ts';
import { captionFoot, CHART_VIEW, clampChart, easeFoot, fitScale, frameChart, openChart, panChart, pinLabel, reopenChart, sameFrame, spreadLabels, wholeChart, zoomChart } from './chart-view.ts';
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
  const inside: PinnedLabel = pinLabel({ x: 600, y: 300 }, 80, 10, FRAME, CHART_VIEW.labelFoot);
  assert.deepEqual(inside, { x: 600, y: 300, pinned: false });
  const left: PinnedLabel = pinLabel({ x: -400, y: 300 }, 80, 10, FRAME, CHART_VIEW.labelFoot);
  assert.deepEqual(left, { x: 80 + CHART_VIEW.labelEdge, y: 300, pinned: true });
  const corner: PinnedLabel = pinLabel({ x: 2000, y: 900 }, 80, 10, FRAME, CHART_VIEW.labelFoot);
  assert.equal(corner.x + 80, FRAME.width - CHART_VIEW.labelEdge);
  assert.equal(corner.y + 10, FRAME.height - CHART_VIEW.labelFoot);
});

void test('a name pinned to the bottom stays above the caption band, however tall the caption wraps', (): void => {
  const twoLines: number = captionFoot(FRAME.height - 18 - 56, 56, FRAME.height);
  assert.equal(twoLines, 18 + 56 + CHART_VIEW.labelGap);
  const low: PinnedLabel = pinLabel({ x: 300, y: 900 }, 80, 10, FRAME, twoLines);
  assert.ok(low.y + 10 + CHART_VIEW.labelGap <= FRAME.height - 18 - 56);
  assert.equal(captionFoot(FRAME.height - 18 - 20, 20, FRAME.height), CHART_VIEW.labelFoot);
  assert.equal(captionFoot(0, 0, FRAME.height), CHART_VIEW.labelFoot);
});

void test('the caption band eases toward its new height over several frames and then settles exactly', (): void => {
  const step: number = 1 / 60;
  const first: number = easeFoot(52, 86, step);
  assert.ok(first > 52 && first < 86);
  let foot: number = first;
  for (let frame: number = 0; frame < 120; frame += 1) foot = easeFoot(foot, 86, step);
  assert.equal(foot, 86);
});

void test('two names pinned onto the same spot are spread apart toward the middle, and apart names stay put', (): void => {
  const low: LabelBox = { x: 300, y: 680, halfWidth: 120, halfHeight: 10 };
  const [first, second] = spreadLabels([low, { ...low, x: 380 }], FRAME);
  assert.deepEqual(first, low);
  assert.equal(second?.y, 680 - 20 - CHART_VIEW.labelGap);
  const apart: LabelBox[] = spreadLabels([low, { ...low, x: 1100 }], FRAME);
  assert.equal(apart[1]?.y, 680);
});

void test('the chart opens centred on where you are, framing every place that can be taken, at no more than the readable zoom', (): void => {
  const spread: AtlasView = frameChart(FRAME, [{ x: 750, y: 700 }, { x: 300, y: 300 }, { x: 1100, y: 1000 }]);
  assert.ok(spread.scale < CHART_VIEW.openScale);
  assert.ok((900 + CHART_VIEW.framePad * 2) * spread.scale <= FRAME.width);
  assert.ok((800 + CHART_VIEW.framePad * 2) * spread.scale <= FRAME.height);
  assert.equal(spread.x, 750);
  assert.equal(spread.y, 700);
  assert.equal(frameChart(FRAME, [{ x: 750, y: 700 }]).scale, CHART_VIEW.openScale);
  assert.deepEqual(frameChart(FRAME, []), wholeChart(FRAME));
});

const SIZES: readonly AtlasFrame[] = [
  { width: 2000, height: 1020, mapWidth: 1500, mapHeight: 1400 },
  { width: 1280, height: 760, mapWidth: 1500, mapHeight: 1400 },
  { width: 390, height: 800, mapWidth: 1500, mapHeight: 1400 },
];
const EYE: ScreenPoint = { x: 750, y: 700 };
const NEAR: readonly ScreenPoint[] = [EYE, { x: 660, y: 610 }, { x: 840, y: 610 }, { x: 660, y: 790 }, { x: 840, y: 790 }, { x: 750, y: 560 }];

void test('at every screen size the chart opens with the eye in the middle of the screen and every near place on it', (): void => {
  for (const frame of SIZES) {
    const view: AtlasView = frameChart(frame, NEAR);
    const eye: ScreenPoint = toScreen(view, frame, EYE);
    assert.ok(Math.abs(eye.x - frame.width / 2) < 1e-6);
    assert.ok(Math.abs(eye.y - frame.height / 2) < 1e-6);
    for (const point of NEAR) {
      const at: ScreenPoint = toScreen(view, frame, point);
      assert.ok(at.x >= 0 && at.x <= frame.width && at.y >= 0 && at.y <= frame.height);
    }
  }
});

void test('the wheel and the buttons zoom about the point given, never about the corner', (): void => {
  for (const frame of SIZES) {
    const view: AtlasView = frameChart(frame, NEAR);
    const cursor: ScreenPoint = { x: frame.width * 0.62, y: frame.height * 0.41 };
    const under: ScreenPoint = toMap(view, frame, cursor);
    const closer: AtlasView = zoomChart(view, frame, cursor, -800);
    assert.ok(closer.scale > view.scale);
    const after: ScreenPoint = toScreen(closer, frame, under);
    assert.ok(Math.abs(after.x - cursor.x) < 1e-6);
    assert.ok(Math.abs(after.y - cursor.y) < 1e-6);
  }
});

void test('fully zoomed out the whole chart sits centred on the screen at every size', (): void => {
  for (const frame of SIZES) {
    const out: AtlasView = zoomChart(frameChart(frame, NEAR), frame, { x: 0, y: 0 }, 99999);
    const corner: ScreenPoint = toScreen(out, frame, { x: 0, y: 0 });
    const far: ScreenPoint = toScreen(out, frame, { x: frame.mapWidth, y: frame.mapHeight });
    assert.ok(Math.abs(corner.x + far.x - frame.width) < 1e-6);
    assert.ok(Math.abs(corner.y + far.y - frame.height) < 1e-6);
    assert.ok(corner.x >= 0 && corner.y >= 0);
  }
});

void test('a later opening keeps the last view, unless a point waits to be spent', (): void => {
  const frame: AtlasFrame = SIZES[1] ?? FRAME;
  const last: AtlasView = { x: 400, y: 500, scale: 1.4 };
  assert.deepEqual(reopenChart(frame, { last, choosing: false, points: NEAR }), clampChart(last, frame));
  assert.deepEqual(reopenChart(frame, { last, choosing: true, points: NEAR }), frameChart(frame, NEAR));
  assert.deepEqual(reopenChart(frame, { last: null, choosing: false, points: NEAR }), frameChart(frame, NEAR));
});

void test('a frame is the same only when every side matches', (): void => {
  assert.ok(sameFrame(FRAME, { ...FRAME }));
  assert.ok(!sameFrame(FRAME, { ...FRAME, height: 699 }));
});
