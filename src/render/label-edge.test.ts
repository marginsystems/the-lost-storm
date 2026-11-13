import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PhoneScreen, Rect } from '../mobile/phone-layout.ts';
import { layoutRects, phoneLayout } from '../mobile/phone-layout.ts';
import type { BandRect, HudBand, HudFit } from '../hud/hud-fit.ts';
import { hudBand, hudFit } from '../hud/hud-fit.ts';
import { anchorInView, heldReach, keepApart, keepBelowTop, keepInside, keepTagInView, LABEL_EDGE, placeTag, stackAtEdges } from './label-edge.ts';
import type { EdgeStack, EdgeTag, ViewSize } from './label-edge.ts';
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
  assert.equal(keepBelowTop(-32, 20, phone), LABEL_EDGE.topClear + 20);
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

const DESKTOP_HUD = { minimapTop: 12, minimapRight: 16, minimapLabel: 20, questsTop: 48, questsRight: 18, questsTall: 200 } as const;
const DESKTOPS: readonly ViewSize[] = [
  { width: 800, height: 700 },
  { width: 950, height: 1050 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
const bandRect = (rect: BandRect): ScreenRect => ({ left: rect.x, top: rect.y, right: rect.x + rect.w, bottom: rect.y + rect.h });

function desktopRects(view: ViewSize): ScreenRect[] {
  const fit: HudFit = hudFit(view.width, view.height);
  const band: HudBand = hudBand(fit, view.width, view.height);
  const mapRight: number = view.width - DESKTOP_HUD.minimapRight;
  const questsTop: number = DESKTOP_HUD.questsTop + fit.minimap;
  return [
    bandRect(band.life),
    bandRect(band.mana),
    bandRect(band.bar),
    { left: mapRight - fit.minimap, top: DESKTOP_HUD.minimapTop, right: mapRight, bottom: DESKTOP_HUD.minimapTop + DESKTOP_HUD.minimapLabel + fit.minimap },
    { left: view.width - DESKTOP_HUD.questsRight - fit.quests, top: questsTop, right: view.width - DESKTOP_HUD.questsRight, bottom: questsTop + DESKTOP_HUD.questsTall },
  ];
}

void test('on desktop an exit, person or ground tag clears the minimap, quest tracker, globes and bar at every size', (): void => {
  for (const view of DESKTOPS) {
    const rects: ScreenRect[] = desktopRects(view);
    for (const tag of [TAG, { width: 150, height: 26 }]) {
      for (let ax = -120; ax <= view.width + 120; ax += 61) {
        for (let ay = -120; ay <= view.height + 120; ay += 59) {
          const place = placeTag(ax, ay, tag.width, tag.height, view, rects);
          const where: string = `${view.width}x${view.height} tag ${tag.width} at ${ax},${ay}`;
          const box: ScreenRect = { left: place.x - tag.width / 2, top: place.y - tag.height, right: place.x + tag.width / 2, bottom: place.y };
          assert.ok(box.left >= 0 && box.right <= view.width && box.top >= 0 && box.bottom <= view.height, where);
          for (const rect of rects) assert.ok(box.right <= rect.left || rect.right <= box.left || box.bottom <= rect.top || rect.bottom <= box.top, where);
        }
      }
    }
  }
});

void test('the shore exit at 1280 by 800 that sat half behind the minimap moves clear of it, beside its doorway', (): void => {
  const view: ViewSize = { width: 1280, height: 800 };
  const rects: ScreenRect[] = desktopRects(view);
  const minimap: ScreenRect | undefined = rects[3];
  assert.ok(minimap !== undefined);
  const place = placeTag(minimap.left + 10, 120, 150, 26, view, rects);
  assert.ok(place.x + 75 <= minimap.left || place.y - 26 >= minimap.bottom);
});

void test('a gliding tag past the right or bottom edge is held fully inside the view', (): void => {
  const view: ViewSize = { width: 1280, height: 800 };
  const [x, y] = keepTagInView(1300, 830, 140, 25, view);
  assert.equal(x + 70, view.width - LABEL_EDGE.side);
  assert.equal(y, view.height - LABEL_EDGE.side);
  assert.deepEqual(keepTagInView(640, 400, 140, 25, view), [640, 400]);
});

function corner(id: number, reach: number, offscreen: boolean): EdgeTag {
  return { id, x: 1200, y: 792, width: 140, height: 25, reach, offscreen };
}

function boxesOf(tags: readonly EdgeTag[], stack: EdgeStack): { top: number; bottom: number; id: number }[] {
  return tags.map((tag: EdgeTag): { top: number; bottom: number; id: number } => {
    const scale: number = stack.quiet.has(tag.id) ? LABEL_EDGE.quietScale : 1;
    const bottom: number = tag.y + (stack.lift.get(tag.id) ?? 0);
    return { id: tag.id, bottom, top: bottom - tag.height * scale };
  });
}

void test('labels clamped to the same edge stack with a gap, the one nearest its anchor keeping the edge spot', (): void => {
  const view: ViewSize = { width: 1280, height: 800 };
  const tags: EdgeTag[] = [corner(1, 40, false), corner(2, 5, false)];
  const stack: EdgeStack = stackAtEdges(tags, view);
  assert.equal(stack.lift.get(2), 0);
  const [far, near] = boxesOf(tags, stack);
  assert.ok(far !== undefined && near !== undefined);
  assert.ok(far.bottom <= near.top - LABEL_EDGE.stackGap);
  assert.equal(stack.quiet.size, 0);
});

void test('three labels piled on one edge never overlap, and only the ones whose people are off screen go quiet', (): void => {
  const view: ViewSize = { width: 1280, height: 800 };
  const tags: EdgeTag[] = [corner(1, 10, false), corner(2, 60, true), corner(3, 90, true)];
  const stack: EdgeStack = stackAtEdges(tags, view);
  assert.deepEqual([...stack.quiet].toSorted((a: number, b: number): number => a - b), [2, 3]);
  const boxes = boxesOf(tags, stack).toSorted((a, b) => b.bottom - a.bottom);
  for (let index: number = 1; index < boxes.length; index += 1) {
    const lower = boxes[index - 1];
    const upper = boxes[index];
    assert.ok(lower !== undefined && upper !== undefined && upper.bottom <= lower.top - LABEL_EDGE.stackGap + 1e-9);
  }
});

function nearTop(id: number, reach: number): EdgeTag {
  return { id, x: 640, y: 60, width: 140, height: 25, reach, offscreen: false };
}

void test('a label near the top edge stacks downward, away from the edge', (): void => {
  const view: ViewSize = { width: 1280, height: 800 };
  const stack: EdgeStack = stackAtEdges([nearTop(1, 1), nearTop(2, 9)], view);
  assert.ok((stack.lift.get(2) ?? 0) > 0);
});

function shownTag(id: number, y: number): EdgeTag {
  return { id, x: 1200, y, width: 120, height: 25, reach: 0, offscreen: true };
}

void test('labels still easing apart are kept apart, the lower one holding its place', (): void => {
  const view: ViewSize = { width: 1280, height: 800 };
  const apart: ReadonlyMap<number, number> = keepApart([shownTag(1, 741), shownTag(2, 735)], [], view);
  assert.equal(apart.get(1), 0);
  const lifted: number = 735 + (apart.get(2) ?? 0);
  assert.ok(lifted <= 741 - 25 - LABEL_EDGE.stackGap + 1e-9);
});

void test('a label kept apart steps above a HUD button instead of covering it', (): void => {
  const view: ViewSize = { width: 1280, height: 800 };
  const button: ScreenRect = { left: 1180, top: 740, right: 1230, bottom: 790 };
  const apart: ReadonlyMap<number, number> = keepApart([shownTag(1, 780)], [button], view);
  assert.ok(780 + (apart.get(1) ?? 0) <= button.top - LABEL_EDGE.stackGap + 1e-9);
});

void test('a label keeps its place in the order until its reach moves past the hold', (): void => {
  assert.equal(heldReach(undefined, 300), 300);
  assert.equal(heldReach(300, 300 + LABEL_EDGE.reachHold - 1), 300);
  assert.equal(heldReach(300, 300 + LABEL_EDGE.reachHold + 1), 300 + LABEL_EDGE.reachHold + 1);
});
