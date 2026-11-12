import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PhoneScreen, Rect } from '../mobile/phone-layout.ts';
import { layoutRects, phoneLayout } from '../mobile/phone-layout.ts';
import { anchorInView, keepBelowTop, keepInside, LABEL_EDGE, placeTag } from './label-edge.ts';
import type { ScreenRect } from './label-stack.ts';

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

const PHONES: readonly PhoneScreen[] = [
  { width: 390, height: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } },
  { width: 390, height: 664, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { width: 844, height: 390, safe: { top: 0, right: 47, bottom: 21, left: 47 } },
  { width: 667, height: 375, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { width: 375, height: 667, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { width: 360, height: 640, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { width: 932, height: 430, safe: { top: 0, right: 47, bottom: 21, left: 47 } },
  { width: 320, height: 568, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { width: 568, height: 320, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
];
const PASSING: ReadonlySet<string> = new Set<string>(['dialogue', 'card', 'toast']);
const screenRect = (rect: Rect): ScreenRect => ({ left: rect.x, top: rect.y, right: rect.x + rect.w, bottom: rect.y + rect.h });
const TAG = { width: 66, height: 20 };

void test('at every phone size a ground tag lands in the free play area, clear of every HUD piece, wherever its item is', (): void => {
  for (const screen of PHONES) {
    const rects: ScreenRect[] = layoutRects(phoneLayout(screen, { skills: 5, flasks: 2, menu: 5 }))
      .filter(({ name }): boolean => !PASSING.has(name))
      .map(({ rect }): ScreenRect => screenRect(rect));
    for (let ax = -120; ax <= screen.width + 120; ax += 47) {
      for (let ay = -120; ay <= screen.height + 120; ay += 53) {
        const place = placeTag(ax, ay, TAG.width, TAG.height, screen, rects);
        const where: string = `${screen.width}x${screen.height} item at ${ax},${ay}`;
        const box: ScreenRect = { left: place.x - TAG.width / 2, top: place.y - TAG.height, right: place.x + TAG.width / 2, bottom: place.y };
        assert.ok(box.left >= 0 && box.right <= screen.width && box.top >= 0 && box.bottom <= screen.height, where);
        for (const rect of rects) assert.ok(box.right <= rect.left || rect.right <= box.left || box.bottom <= rect.top || rect.bottom <= box.top, where);
      }
    }
  }
});

void test('a tag moved away from its item points toward it, and one standing on its item does not', (): void => {
  const view = { width: 390, height: 844 };
  const blocker: ScreenRect = { left: 280, top: 0, right: 390, bottom: 140 };
  const shifted = placeTag(330, 60, TAG.width, TAG.height, view, [blocker]);
  assert.equal(shifted.away, true);
  assert.ok(Math.cos(shifted.turn) * (330 - shifted.x) + Math.sin(shifted.turn) * (60 - (shifted.y - TAG.height / 2)) > 0);
  const off = placeTag(500, 400, TAG.width, TAG.height, view, []);
  assert.equal(off.away, true);
  assert.ok(Math.abs(off.turn) < Math.PI / 2);
  const home = placeTag(200, 400, TAG.width, TAG.height, view, [blocker]);
  assert.equal(home.away, false);
  assert.deepEqual([home.x, home.y], [200, 400]);
});

void test('a tag placed again from its stacked spot is not moved by stacking alone, and still aims at its item', (): void => {
  const view = { width: 390, height: 844 };
  const item = { x: 200, y: 400 };
  const stacked = placeTag(200, 376, TAG.width, TAG.height, view, [], item);
  assert.equal(stacked.away, false);
  assert.ok(stacked.turn > 0);
  const pushed = placeTag(200, 376, TAG.width, TAG.height, view, [{ left: 150, top: 340, right: 250, bottom: 380 }], item);
  assert.equal(pushed.away, true);
  assert.ok(Math.cos(pushed.turn) * (item.x - pushed.x) + Math.sin(pushed.turn) * (item.y - (pushed.y - TAG.height / 2)) > 0);
});
