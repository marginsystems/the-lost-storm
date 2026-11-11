import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { VoiceLimiter } from './voices.ts';
import { createVoiceLimiter } from './voices.ts';

void test('no more copies of a sound than its cap play at once', (): void => {
  const limiter: VoiceLimiter = createVoiceLimiter((): number => 0);
  assert.equal(limiter.tryStart('hit', 2, 0), true);
  assert.equal(limiter.tryStart('hit', 2, 0), true);
  assert.equal(limiter.tryStart('hit', 2, 0), false);
  assert.equal(limiter.active('hit'), 2);
  limiter.end('hit');
  assert.equal(limiter.tryStart('hit', 2, 0), true);
});

void test('caps are per sound', (): void => {
  const limiter: VoiceLimiter = createVoiceLimiter((): number => 0);
  assert.equal(limiter.tryStart('a', 1, 0), true);
  assert.equal(limiter.tryStart('b', 1, 0), true);
  assert.equal(limiter.tryStart('a', 1, 0), false);
});

void test('a sound waits out its cooldown, and a refused start does not restart it', (): void => {
  let now: number = 10;
  const limiter: VoiceLimiter = createVoiceLimiter((): number => now);
  assert.equal(limiter.tryStart('rising', 4, 4), true);
  now = 12;
  assert.equal(limiter.tryStart('rising', 4, 4), false);
  now = 13.9;
  assert.equal(limiter.tryStart('rising', 4, 4), false);
  now = 14;
  assert.equal(limiter.tryStart('rising', 4, 4), true);
  assert.equal(limiter.active('rising'), 2);
});

void test('ending more than was started never goes below zero', (): void => {
  const limiter: VoiceLimiter = createVoiceLimiter((): number => 0);
  limiter.end('x');
  limiter.end('x');
  assert.equal(limiter.active('x'), 0);
  assert.equal(limiter.tryStart('x', 1, 0), true);
  assert.equal(limiter.tryStart('x', 1, 0), false);
});
