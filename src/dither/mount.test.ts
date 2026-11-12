import assert from 'node:assert/strict';
import { test } from 'node:test';
import { titleClosed, unfinishedNames } from './mount.ts';

void test('the title backdrop is released when the opening iris ends, not when the fade ends under it', (): void => {
  assert.equal(titleClosed({ kind: 'animation', name: 'title-open' }), true);
  assert.equal(titleClosed({ kind: 'animation', name: 'title-leave' }), false);
  assert.equal(titleClosed({ kind: 'transition', name: 'opacity', running: ['title-open'] }), false);
});

void test('with no iris running, the end of the fade releases the backdrop', (): void => {
  assert.equal(titleClosed({ kind: 'transition', name: 'opacity', running: [] }), true);
  assert.equal(titleClosed({ kind: 'transition', name: 'visibility', running: [] }), false);
});

void test('a finished iris no longer holds the backdrop when the fade ends after it', (): void => {
  assert.equal(titleClosed({ kind: 'transition', name: 'opacity', running: ['title-leave'] }), true);
});

void test('only animations still playing hold the backdrop, and a finished iris drops out of the list', (): void => {
  const iris = { playState: 'running', animationName: 'title-open' };
  const done = { playState: 'finished', animationName: 'title-open' };
  const fade = { playState: 'running' };
  assert.deepEqual(unfinishedNames([iris, fade]), ['title-open', '']);
  assert.deepEqual(unfinishedNames([done, fade]), ['']);
  assert.equal(titleClosed({ kind: 'transition', name: 'opacity', running: unfinishedNames([iris]) }), false);
  assert.equal(titleClosed({ kind: 'transition', name: 'opacity', running: unfinishedNames([done]) }), true);
});
