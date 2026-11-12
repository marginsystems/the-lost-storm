import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PhoneScreen, Rect, SafeInsets } from './phone-layout.ts';
import { collisions, layoutRects, overlaps, PHONE, phoneLayout } from './phone-layout.ts';

const NO_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const NOTCH_PORTRAIT: SafeInsets = { top: 47, right: 0, bottom: 34, left: 0 };
const NOTCH_LANDSCAPE: SafeInsets = { top: 0, right: 47, bottom: 21, left: 47 };

const SCREENS: readonly PhoneScreen[] = [
  { width: 390, height: 844, safe: NOTCH_PORTRAIT },
  { width: 390, height: 664, safe: NO_INSETS },
  { width: 844, height: 390, safe: NOTCH_LANDSCAPE },
  { width: 750, height: 340, safe: NO_INSETS },
  { width: 375, height: 667, safe: NO_INSETS },
  { width: 375, height: 548, safe: NO_INSETS },
  { width: 667, height: 375, safe: NO_INSETS },
  { width: 667, height: 325, safe: NO_INSETS },
  { width: 360, height: 640, safe: NO_INSETS },
  { width: 640, height: 360, safe: NO_INSETS },
  { width: 932, height: 430, safe: NOTCH_LANDSCAPE },
  { width: 320, height: 568, safe: NO_INSETS },
  { width: 568, height: 320, safe: NO_INSETS },
];

const label = (screen: PhoneScreen, skills: number, flasks: number): string => `${screen.width}x${screen.height} top ${screen.safe.top} with ${skills} skills, ${flasks} flasks`;

const inside = (rect: Rect, screen: PhoneScreen): boolean =>
  rect.x >= screen.safe.left && rect.y >= screen.safe.top && rect.x + rect.w <= screen.width - screen.safe.right && rect.y + rect.h <= screen.height - screen.safe.bottom;

void test('two rectangles that share area collide, two that only touch do not', (): void => {
  const a: Rect = { x: 0, y: 0, w: 10, h: 10 };
  assert.deepEqual(collisions([{ name: 'a', rect: a }, { name: 'b', rect: { x: 9, y: 9, w: 4, h: 4 } }]), ['a × b']);
  assert.deepEqual(collisions([{ name: 'a', rect: a }, { name: 'c', rect: { x: 10, y: 0, w: 4, h: 4 } }]), []);
});

void test('no two phone HUD pieces overlap at any phone size, inset or control count', (): void => {
  for (const screen of SCREENS) {
    for (let skills = 0; skills <= 6; skills += 1) {
      for (let flasks = 0; flasks <= 2; flasks += 1) {
        const rects = layoutRects(phoneLayout(screen, { skills, flasks, menu: 5 }));
        assert.deepEqual(collisions(rects), [], label(screen, skills, flasks));
        for (const { name, rect } of rects) assert.ok(inside(rect, screen), `${name} leaves the safe area at ${label(screen, skills, flasks)}`);
      }
    }
  }
});

void test('every touch target is at least thumb sized', (): void => {
  for (const screen of SCREENS) {
    const layout = phoneLayout(screen, { skills: 5, flasks: 2, menu: 5 });
    assert.ok(layout.menu.button >= PHONE.menuButton, `menu buttons shrink at ${label(screen, 5, 2)}`);
    for (const rect of [layout.attack, ...layout.skills, ...layout.flasks]) assert.ok(Math.min(rect.w, rect.h) >= PHONE.flaskButton, label(screen, 5, 2));
  }
});

void test('the menu row clears the zone name and the minimap with a gap', (): void => {
  for (const screen of SCREENS) {
    const layout = phoneLayout(screen, { skills: 5, flasks: 2, menu: 5 });
    const reach: Rect = { ...layout.menu.rect, w: layout.menu.rect.w + PHONE.gap };
    assert.equal(overlaps(reach, layout.zone) || overlaps(reach, layout.minimap), false, label(screen, 5, 2));
  }
});

void test('the xp bar sits at the very bottom of the safe area and every control stands above it', (): void => {
  for (const screen of SCREENS) {
    const layout = phoneLayout(screen, { skills: 5, flasks: 2, menu: 5 });
    assert.equal(layout.xp.y + layout.xp.h, screen.height - screen.safe.bottom - PHONE.xpLift);
    for (const rect of [layout.stick, layout.attack, layout.hint, ...layout.skills, ...layout.flasks]) assert.ok(rect.y + rect.h <= layout.xp.y - PHONE.gap, label(screen, 5, 2));
  }
});

void test('a wide screen keeps the hint beside the controls, a narrow one lifts it above them', (): void => {
  const wide = phoneLayout({ width: 844, height: 390, safe: NOTCH_LANDSCAPE }, { skills: 5, flasks: 2, menu: 5 });
  assert.equal(wide.hint.y + wide.hint.h, wide.attack.y + wide.attack.h);
  assert.ok(wide.hint.w >= PHONE.hintMinWidth);
  const narrow = phoneLayout({ width: 390, height: 844, safe: NOTCH_PORTRAIT }, { skills: 5, flasks: 2, menu: 5 });
  const tops: number[] = [narrow.stick, narrow.attack, ...narrow.skills, ...narrow.flasks].map((rect: Rect): number => rect.y);
  assert.equal(narrow.hint.y + narrow.hint.h, Math.min(...tops) - PHONE.gap);
});

void test('skill buttons sit on a grid with a gap between neighbours', (): void => {
  const layout = phoneLayout({ width: 390, height: 844, safe: NOTCH_PORTRAIT }, { skills: 5, flasks: 2, menu: 5 });
  const pitch: number = PHONE.skill + PHONE.skillGap;
  const first: Rect | undefined = layout.skills[0];
  assert.ok(first !== undefined);
  for (const rect of layout.skills) {
    assert.equal(Math.abs(rect.x - first.x) % pitch, 0);
    assert.equal(Math.abs(first.y - rect.y) % pitch, 0);
  }
});

void test('the rotate toast and both globes stay whole and clear of every other piece', (): void => {
  for (const screen of SCREENS) {
    const layout = phoneLayout(screen, { skills: 5, flasks: 2, menu: 5 });
    const others = layoutRects(layout).filter(({ name }): boolean => !['toast', 'life', 'mana'].includes(name));
    for (const piece of [layout.toast, layout.life, layout.mana]) {
      assert.ok(inside(piece, screen), label(screen, 5, 2));
      for (const { name, rect } of others) assert.equal(overlaps(piece, rect), false, `${name} at ${label(screen, 5, 2)}`);
    }
    assert.equal(overlaps(layout.toast, layout.life) || overlaps(layout.toast, layout.mana), false, label(screen, 5, 2));
    assert.ok(layout.toast.w >= PHONE.hintMinWidth, label(screen, 5, 2));
  }
});

void test('the zone name gets its own width above the minimap, clear of the menu', (): void => {
  for (const screen of SCREENS) {
    const layout = phoneLayout(screen, { skills: 1, flasks: 2, menu: 5 });
    if (screen.width >= PHONE.zoneRoomyWidth) assert.ok(layout.zone.w >= PHONE.zoneWidth, label(screen, 1, 2));
    assert.ok(layout.zone.x >= layout.manaFlask.x + layout.manaFlask.w + PHONE.gap, label(screen, 1, 2));
    assert.equal(layout.zone.x + layout.zone.w, layout.minimap.x + layout.minimap.w);
    assert.equal(overlaps(layout.zone, layout.menu.rect), false, label(screen, 1, 2));
  }
});

void test('while someone speaks the dialogue box owns the space above the xp bar, clear of every piece that stays', (): void => {
  for (const screen of SCREENS) {
    const layout = phoneLayout(screen, { skills: 5, flasks: 2, menu: 5 });
    assert.ok(inside(layout.dialogue, screen), label(screen, 5, 2));
    assert.ok(layout.dialogue.h >= PHONE.toastHeight, label(screen, 5, 2));
    const staying: Rect[] = [layout.life, layout.mana, layout.lifeFlask, layout.manaFlask, layout.menu.rect, layout.zone, layout.minimap, layout.xp, layout.attack];
    for (const rect of staying) assert.equal(overlaps(layout.dialogue, rect), false, label(screen, 5, 2));
  }
});

void test('the end card is a centred sheet that fits inside the safe area with a margin', (): void => {
  for (const screen of SCREENS) {
    const { card } = phoneLayout(screen, { skills: 5, flasks: 2, menu: 5 });
    assert.ok(inside(card, screen), label(screen, 5, 2));
    assert.ok(card.x - screen.safe.left >= PHONE.cardInset && screen.width - screen.safe.right - card.x - card.w >= PHONE.cardInset, label(screen, 5, 2));
    assert.equal(Math.round(card.x - screen.safe.left), Math.round(screen.width - screen.safe.right - card.x - card.w));
    assert.ok(card.w >= PHONE.hintMinWidth && card.h >= PHONE.dialogueMaxHeight, label(screen, 5, 2));
  }
});
