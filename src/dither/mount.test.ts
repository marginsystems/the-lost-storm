import assert from 'node:assert/strict';
import { test } from 'node:test';
import { titleClosed } from './mount.ts';

void test('the title backdrop is released when the opening iris ends, not when the fade ends under it', (): void => {
  assert.equal(titleClosed({ kind: 'animation', name: 'title-open' }), true);
  assert.equal(titleClosed({ kind: 'animation', name: 'title-leave' }), false);
  assert.equal(titleClosed({ kind: 'transition', name: 'opacity', running: ['title-open'] }), false);
});

void test('with no iris running, the end of the fade releases the backdrop', (): void => {
  assert.equal(titleClosed({ kind: 'transition', name: 'opacity', running: ['none'] }), true);
  assert.equal(titleClosed({ kind: 'transition', name: 'visibility', running: ['none'] }), false);
});
