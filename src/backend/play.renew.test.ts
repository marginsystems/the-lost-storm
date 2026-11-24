import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Play } from './play.ts';
import { createPlay } from './play.ts';

void test('a renewed play has a new id and claims again with its next write', (): void => {
  const play: Play = createPlay('page-a');
  play.claimed();
  play.renew('page-b');
  assert.equal(play.id, 'page-b');
  assert.deepEqual(play.stamp(), { id: 'page-b', claim: true });
});

void test('a renewed play still tells the page when it is replaced', (): void => {
  const play: Play = createPlay('page-a');
  const heard: string[] = [];
  play.onReplaced((): void => void heard.push('page'));
  play.renew('page-b');
  play.replace();
  assert.deepEqual(heard, ['page']);
});
