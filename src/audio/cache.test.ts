import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BufferCache } from './cache.ts';
import { createBufferCache } from './cache.ts';

void test('the least recently used entries go when the budget is passed', (): void => {
  const cache: BufferCache<number> = createBufferCache<number>(100, (value: number): number => value);
  cache.set('a', 40);
  cache.set('b', 40);
  assert.equal(cache.get('a'), 40);
  cache.set('c', 40);
  assert.equal(cache.has('b'), false);
  assert.equal(cache.has('a'), true);
  assert.equal(cache.has('c'), true);
  assert.equal(cache.bytes, 80);
  assert.equal(cache.size, 2);
});

void test('replacing an entry updates the total and one oversized entry is still kept', (): void => {
  const cache: BufferCache<number> = createBufferCache<number>(100, (value: number): number => value);
  cache.set('a', 30);
  cache.set('a', 50);
  assert.equal(cache.bytes, 50);
  cache.set('huge', 500);
  assert.equal(cache.has('huge'), true);
  assert.equal(cache.has('a'), false);
  assert.equal(cache.get('missing'), undefined);
});
