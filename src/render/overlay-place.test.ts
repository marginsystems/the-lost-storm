import assert from 'node:assert/strict';
import { test } from 'node:test';
import { glideApart } from './overlay-place.ts';

void test('a tag pushed apart from its neighbours eases to the new spot instead of jumping there', (): void => {
  const tag: object = {};
  assert.equal(glideApart(tag, 0, 1 / 60), 0);
  const first: number = glideApart(tag, -40, 1 / 60);
  assert.ok(first < 0 && first > -40, `moved ${String(first)} in one frame`);
  let shown: number = first;
  for (let frame: number = 0; frame < 120; frame += 1) shown = glideApart(tag, -40, 1 / 60);
  assert.equal(shown, -40);
});

void test('each tag keeps its own easing', (): void => {
  const near: object = {};
  const far: object = {};
  glideApart(near, 0, 1 / 60);
  glideApart(far, 0, 1 / 60);
  glideApart(near, -30, 1 / 60);
  assert.equal(glideApart(far, 0, 1 / 60), 0);
});
