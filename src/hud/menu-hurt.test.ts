import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HurtWatch } from './menu-hurt.ts';
import { hurtShown, MENU_HURT, watchHurt } from './menu-hurt.ts';

void test('the line shows when life falls and goes once the hits stop', (): void => {
  const opened: HurtWatch = { life: 80, hold: 0 };
  const hit: HurtWatch = watchHurt(opened, 72, 0.016);
  assert.equal(hurtShown(hit), true);
  const held: HurtWatch = watchHurt(hit, 72, MENU_HURT.holdSeconds / 2);
  assert.equal(hurtShown(held), true);
  assert.equal(hurtShown(watchHurt(held, 72, MENU_HURT.holdSeconds)), false);
});

void test('healing or standing still never shows the line', (): void => {
  const opened: HurtWatch = { life: 50, hold: 0 };
  assert.equal(hurtShown(watchHurt(opened, 60, 0.016)), false);
  assert.equal(hurtShown(watchHurt(opened, 50, 0.016)), false);
});
