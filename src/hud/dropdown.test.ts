import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { jumpTo, listSpot, react, snap } from './dropdown.ts';
import type { ListSpot, Reaction } from './dropdown.ts';

const LABELS: readonly string[] = ['Any', 'Weapon', 'Head', 'Chest', 'Hands', 'Legs', 'Feet', 'Charm'];
const VIEW = { left: 0, top: 0, right: 1000, bottom: 700 } as const;
const BUTTON = { left: 100, top: 100, right: 180, bottom: 126 } as const;

function pressed(key: string, open: boolean, active: number): Reaction {
  return react(key, open, active, LABELS);
}

void test('a closed list opens on Enter, Space, Down and Up at the current choice', (): void => {
  for (const key of ['Enter', ' ', 'ArrowDown', 'ArrowUp']) assert.deepEqual(pressed(key, false, 3), { kind: 'open', active: 3 }, key);
});

void test('a closed list opens at the first or last choice on Home and End', (): void => {
  assert.deepEqual(pressed('Home', false, 3), { kind: 'open', active: 0 });
  assert.deepEqual(pressed('End', false, 3), { kind: 'open', active: 7 });
});

void test('a closed list lets Escape and Tab through, so the panel still closes and focus still moves', (): void => {
  assert.deepEqual(pressed('Escape', false, 0), { kind: 'ignore' });
  assert.deepEqual(pressed('Tab', false, 0), { kind: 'ignore' });
});

void test('an open list moves with Up and Down and stops at both ends', (): void => {
  assert.deepEqual(pressed('ArrowDown', true, 2), { kind: 'move', active: 3 });
  assert.deepEqual(pressed('ArrowUp', true, 2), { kind: 'move', active: 1 });
  assert.deepEqual(pressed('ArrowUp', true, 0), { kind: 'move', active: 0 });
  assert.deepEqual(pressed('ArrowDown', true, 7), { kind: 'move', active: 7 });
});

void test('Home and End jump to the ends of an open list', (): void => {
  assert.deepEqual(pressed('Home', true, 4), { kind: 'move', active: 0 });
  assert.deepEqual(pressed('End', true, 4), { kind: 'move', active: 7 });
});

void test('Enter and Space choose the highlighted row, Escape closes without choosing', (): void => {
  assert.deepEqual(pressed('Enter', true, 4), { kind: 'choose', active: 4 });
  assert.deepEqual(pressed(' ', true, 4), { kind: 'choose', active: 4 });
  assert.deepEqual(pressed('Escape', true, 4), { kind: 'close' });
});

void test('typing a letter jumps to the next choice that starts with it, wrapping round', (): void => {
  assert.equal(jumpTo(LABELS, 0, 'h'), 2);
  assert.equal(jumpTo(LABELS, 2, 'h'), 4);
  assert.equal(jumpTo(LABELS, 4, 'h'), 2);
  assert.equal(jumpTo(LABELS, 0, 'C'), 3);
  assert.equal(jumpTo(LABELS, 3, 'c'), 7);
  assert.equal(jumpTo(LABELS, 0, 'z'), null);
});

void test('a letter moves an open list and opens a closed one, and one that matches nothing is still held back from the game', (): void => {
  assert.deepEqual(pressed('l', true, 0), { kind: 'move', active: 5 });
  assert.deepEqual(pressed('l', false, 0), { kind: 'open', active: 5 });
  assert.deepEqual(pressed('q', true, 0), { kind: 'hold' });
  assert.deepEqual(pressed('q', false, 0), { kind: 'hold' });
});

void test('a list with no choices reacts to nothing', (): void => {
  assert.deepEqual(react('Enter', false, 0, []), { kind: 'ignore' });
  assert.deepEqual(react('a', true, 0, []), { kind: 'ignore' });
});

void test('a list that fits opens just under its button, left edges together', (): void => {
  const spot: ListSpot = listSpot(BUTTON, 120, 208, VIEW, 1);
  assert.deepEqual(spot, { left: 100, top: 130, width: 120, maxHeight: 562, above: false });
});

void test('a list with no room below opens above the button, its bottom a gap over the button', (): void => {
  const low = { left: 100, top: 640, right: 180, bottom: 666 } as const;
  const spot: ListSpot = listSpot(low, 120, 208, VIEW, 1);
  assert.equal(spot.above, true);
  assert.equal(spot.top + 208 + 4, 640);
});

void test('a list too tall for both sides takes the larger side and scrolls inside it', (): void => {
  const middle = { left: 100, top: 300, right: 180, bottom: 326 } as const;
  const spot: ListSpot = listSpot(middle, 120, 900, VIEW, 1);
  assert.equal(spot.above, false);
  assert.equal(spot.maxHeight, 700 - 8 - 330);
  const tall = { left: 100, top: 500, right: 180, bottom: 526 } as const;
  const over: ListSpot = listSpot(tall, 120, 900, VIEW, 1);
  assert.equal(over.above, true);
  assert.equal(over.maxHeight, 500 - 4 - 8);
  assert.equal(over.top, 8);
});

void test('a list never leaves the window sideways, even on a phone', (): void => {
  const edge = { left: 330, top: 100, right: 370, bottom: 126 } as const;
  const phone = { left: 0, top: 0, right: 375, bottom: 667 } as const;
  const spot: ListSpot = listSpot(edge, 140, 100, phone, 2);
  assert.equal(spot.left + spot.width, 375 - 8);
  const wide: ListSpot = listSpot(BUTTON, 900, 100, phone, 2);
  assert.equal(wide.width, 375 - 16);
  assert.equal(wide.left, 8);
});

void test('positions land on whole device pixels', (): void => {
  assert.equal(snap(100.3, 1), 100);
  assert.equal(snap(100.3, 2), 100.5);
  assert.equal(snap(100.74, 2), 100.5);
  assert.equal(snap(100.76, 2), 101);
  const spot: ListSpot = listSpot({ left: 100.3, top: 100.3, right: 180.3, bottom: 126.3 }, 120, 100, VIEW, 2);
  assert.equal(spot.left * 2, Math.round(spot.left * 2));
  assert.equal(spot.top * 2, Math.round(spot.top * 2));
});

void test('a closed list takes no pointer events and cannot be seen, and an open one can', (): void => {
  const sheet: string = readFileSync(new URL('./dropdown.css', import.meta.url), 'utf8');
  const rules: RegExpMatchArray[] = [...sheet.matchAll(/([^{}]+)\{([^}]*)\}/g)];
  const body = (selector: string): string => rules.find((rule: RegExpMatchArray): boolean => (rule[1] ?? '').trim() === selector)?.[2] ?? '';
  assert.match(body('.dropdown-list'), /pointer-events:\s*none;/);
  assert.match(body('.dropdown-list'), /visibility:\s*hidden;/);
  assert.match(body('.dropdown-list.open'), /pointer-events:\s*auto;/);
  assert.match(body('.dropdown-list.open'), /visibility:\s*visible;/);
});

void test('every motion in the dropdown stylesheet uses the spring tokens', (): void => {
  const sheet: string = readFileSync(new URL('./dropdown.css', import.meta.url), 'utf8');
  assert.ok(!/cubic-bezier|ease-in|ease-out|\bease\b/.test(sheet));
  for (const duration of sheet.matchAll(/\b\d+(?:\.\d+)?m?s\b/g)) assert.equal(duration[0], '0s', 'a bare duration');
});

function declared(sheet: string, selector: string, property: string): string {
  const rules: RegExpMatchArray[] = [...sheet.matchAll(/([^{}]+)\{([^}]*)\}/g)];
  const rule: RegExpMatchArray | undefined = rules.find((each: RegExpMatchArray): boolean => (each[1] ?? '').trim() === selector);
  const found: RegExpMatchArray | null = (rule?.[2] ?? '').match(new RegExp(`(?:^|[\\s;])${property}:\\s*([^;]+);`));
  return found?.[1]?.trim() ?? '';
}

void test('a dropdown and a text field in the same row share height, side padding and line box, and a caret sits as far in as the text', (): void => {
  const dropdown: string = readFileSync(new URL('./dropdown.css', import.meta.url), 'utf8');
  const auction: string = readFileSync(new URL('./auction.css', import.meta.url), 'utf8');
  for (const property of ['height', 'padding', 'font-size', 'line-height']) assert.equal(declared(dropdown, '.dropdown-button', property), declared(auction, '.auction-input', property), property);
  assert.equal(declared(dropdown, '.dropdown-button', 'padding'), '0 8px');
  assert.equal(declared(dropdown, '.dropdown-option', 'height'), declared(dropdown, '.dropdown-button', 'height'));
  assert.equal(declared(dropdown, '.dropdown-caret', 'width'), '10px');
  assert.equal(declared(dropdown, '.dropdown-caret', 'height'), '6px');
});
