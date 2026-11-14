import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChatReady, EnterPress } from './chat-keys.ts';
import { takesEnter } from './chat-keys.ts';

const FREE: EnterPress = { code: 'Enter', repeat: false, taken: false, typing: false, onControl: false };
const READY: ChatReady = { shown: true, canFocus: true };

void test('Enter with nothing else using it opens chat, from either Enter key', (): void => {
  assert.equal(takesEnter(FREE, READY), true);
  assert.equal(takesEnter({ ...FREE, code: 'NumpadEnter' }, READY), true);
});

void test('an Enter a book, the journal or another panel already took never reaches chat', (): void => {
  assert.equal(takesEnter({ ...FREE, taken: true }, READY), false);
});

void test('a held Enter, Enter in another field or on a focused button, or any other key leaves chat alone', (): void => {
  assert.equal(takesEnter({ ...FREE, repeat: true }, READY), false);
  assert.equal(takesEnter({ ...FREE, typing: true }, READY), false);
  assert.equal(takesEnter({ ...FREE, onControl: true }, READY), false);
  for (const code of ['KeyM', 'KeyT', 'Tab', 'Escape', 'Slash', 'Space']) assert.equal(takesEnter({ ...FREE, code }, READY), false, code);
});

void test('a hidden chat, an open dialogue or a fallen hero does not take Enter', (): void => {
  assert.equal(takesEnter(FREE, { shown: false, canFocus: true }), false);
  assert.equal(takesEnter(FREE, { shown: true, canFocus: false }), false);
});
