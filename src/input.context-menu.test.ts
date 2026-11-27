import assert from 'node:assert/strict';
import test from 'node:test';
import { blockNativeMenu } from './input.ts';

function menuOn(target: EventTarget): Event {
  const event: Event = new Event('contextmenu', { cancelable: true });
  target.addEventListener('contextmenu', blockNativeMenu);
  target.dispatchEvent(event);
  return event;
}

void test('a right click over the game or its HUD never opens the browser menu', (): void => {
  assert.equal(menuOn(new EventTarget()).defaultPrevented, true);
});

void test('a right click in a text field keeps the browser menu for paste', (): void => {
  const field: EventTarget = Object.assign(new EventTarget(), { selectionStart: 0 });
  assert.equal(menuOn(field).defaultPrevented, false);
});

void test('a right click on a slider or a checkbox in a panel never opens the browser menu', (): void => {
  for (const type of ['range', 'checkbox', 'button']) {
    const control: EventTarget = Object.assign(new EventTarget(), { selectionStart: null, type });
    assert.equal(menuOn(control).defaultPrevented, true, type);
  }
});

void test('a right click in a chat box or a textarea keeps the browser menu', (): void => {
  for (const type of ['text', 'search', 'textarea']) {
    const field: EventTarget = Object.assign(new EventTarget(), { selectionStart: 0, type });
    assert.equal(menuOn(field).defaultPrevented, false, type);
  }
});
