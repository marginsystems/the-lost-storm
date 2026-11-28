import assert from 'node:assert/strict';
import { test } from 'node:test';
import { easedFade } from './eased-fade.ts';

void test('a fade eases in and out between nothing and full, and holds outside that span', (): void => {
  assert.equal(easedFade(-1), 0);
  assert.equal(easedFade(0), 0);
  assert.equal(easedFade(0.5), 0.5);
  assert.equal(easedFade(1), 1);
  assert.equal(easedFade(2), 1);
  assert.ok(easedFade(0.1) < 0.1);
  assert.ok(easedFade(0.9) > 0.9);
});
