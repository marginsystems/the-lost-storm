import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PhoneLayout, PhoneScreen, Rect } from './phone-layout.ts';
import { layoutRects, overlaps, PHONE, phoneLayout } from './phone-layout.ts';

const PORTRAIT: readonly PhoneScreen[] = [
  { width: 390, height: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } },
  { width: 390, height: 664, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { width: 375, height: 667, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { width: 375, height: 812, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { width: 360, height: 640, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
];

const EVERY: readonly PhoneScreen[] = [
  ...PORTRAIT,
  { width: 844, height: 390, safe: { top: 0, right: 47, bottom: 21, left: 47 } },
  { width: 667, height: 375, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { width: 932, height: 430, safe: { top: 0, right: 47, bottom: 21, left: 47 } },
  { width: 320, height: 568, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { width: 568, height: 320, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
];

const sizeOf = (screen: PhoneScreen): string => `${String(screen.width)}x${String(screen.height)}`;

const eachLayout = (screens: readonly PhoneScreen[], check: (layout: PhoneLayout, where: string) => void): void => {
  for (const screen of screens) {
    for (let skills = 0; skills <= 6; skills += 1) {
      for (let flasks = 0; flasks <= 2; flasks += 1) check(phoneLayout(screen, { skills, flasks, menu: 6 }), `${sizeOf(screen)} with ${String(skills)} skills, ${String(flasks)} flasks`);
    }
  }
};

void test('every portrait phone has a slot for the party frame', (): void => {
  eachLayout(PORTRAIT, (layout: PhoneLayout, where: string): void => {
    assert.notEqual(layout.party, null, where);
  });
});

void test('a party slot stands clear of every button, globe, map, plate and line, at the frame size', (): void => {
  eachLayout(EVERY, (layout: PhoneLayout, where: string): void => {
    const party: Rect | null = layout.party;
    if (party === null) return;
    for (const { name, rect } of layoutRects(layout)) assert.equal(overlaps(party, rect), false, `party × ${name} at ${where}`);
    assert.equal(overlaps(party, layout.bark), false, `party × bark at ${where}`);
    assert.ok(party.w >= PHONE.partyMinWidth && party.w <= PHONE.partyMaxWidth, where);
    assert.equal(party.h, PHONE.partyHeight);
  });
});

void test('a phone too small for the party frame has no party slot', (): void => {
  for (const screen of EVERY.slice(-2)) assert.equal(phoneLayout(screen, { skills: 5, flasks: 2, menu: 6 }).party, null, sizeOf(screen));
});

void test('an invite card on a phone stands above the toast where there is room, and never covers a control, globe, map or the party frame', (): void => {
  eachLayout(EVERY, (layout: PhoneLayout, where: string): void => {
    const { invite, toast } = layout;
    const onToast: boolean = invite.x === toast.x && invite.y === toast.y && invite.w === toast.w;
    assert.ok(onToast || invite.y + invite.h + PHONE.gap <= toast.y, where);
    if (layout.party !== null) assert.equal(overlaps(invite, layout.party), false, `invite × party at ${where}`);
    for (const { name, rect } of layoutRects(layout)) {
      if (name === 'toast' || name === 'quests') continue;
      assert.equal(overlaps(invite, rect), false, `invite × ${name} at ${where}`);
    }
  });
  const tall: PhoneLayout = phoneLayout({ width: 390, height: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } }, { skills: 5, flasks: 2, menu: 6 });
  assert.ok(tall.invite.y + tall.invite.h + PHONE.gap <= tall.toast.y);
});
