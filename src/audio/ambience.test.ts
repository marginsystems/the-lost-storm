import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import type { AmbienceBatch, AmbienceTracker } from './ambience.ts';
import { createAmbienceTracker } from './ambience.ts';

function batchOf(tracker: AmbienceTracker<string>): AmbienceBatch<string> {
  return must(tracker.take(), 'batch');
}

void test('a started zone hands its loops out once and nothing while that batch is in flight', (): void => {
  const tracker: AmbienceTracker<string> = createAmbienceTracker<string>();
  assert.equal(tracker.take(), null);
  tracker.start(['wind', 'fire']);
  const batch: AmbienceBatch<string> = batchOf(tracker);
  assert.deepEqual(batch.loops, ['wind', 'fire']);
  assert.equal(tracker.take(), null);
  assert.equal(tracker.current(batch.generation), true);
});

void test('loops that failed are queued again when the batch settles, the others are not', (): void => {
  const tracker: AmbienceTracker<string> = createAmbienceTracker<string>();
  tracker.start(['wind', 'fire']);
  const first: AmbienceBatch<string> = batchOf(tracker);
  tracker.settle(first, ['fire']);
  const second: AmbienceBatch<string> = batchOf(tracker);
  assert.deepEqual(second.loops, ['fire']);
  tracker.settle(second, []);
  assert.equal(tracker.take(), null);
});

void test('stopping makes an earlier batch stale: it is not current and its failures are not queued', (): void => {
  const tracker: AmbienceTracker<string> = createAmbienceTracker<string>();
  tracker.start(['wind']);
  const batch: AmbienceBatch<string> = batchOf(tracker);
  tracker.stop();
  assert.equal(tracker.current(batch.generation), false);
  tracker.settle(batch, ['wind']);
  assert.equal(tracker.take(), null);
});

void test('re-entering the same zone while its first loops load makes the first batch stale and starts a clean one', (): void => {
  const tracker: AmbienceTracker<string> = createAmbienceTracker<string>();
  const zone: readonly string[] = ['wind', 'fire'];
  tracker.start(zone);
  const old: AmbienceBatch<string> = batchOf(tracker);
  tracker.stop();
  tracker.start(zone);
  const fresh: AmbienceBatch<string> = batchOf(tracker);
  assert.equal(tracker.current(old.generation), false);
  assert.equal(tracker.current(fresh.generation), true);
  assert.deepEqual(fresh.loops, zone);
  tracker.settle(old, ['wind']);
  assert.equal(tracker.take(), null);
  tracker.settle(fresh, []);
  assert.equal(tracker.take(), null);
});

void test('starting a zone over another without a stop also drops the earlier batch', (): void => {
  const tracker: AmbienceTracker<string> = createAmbienceTracker<string>();
  tracker.start(['cave']);
  const old: AmbienceBatch<string> = batchOf(tracker);
  tracker.start(['fort']);
  assert.equal(tracker.current(old.generation), false);
  assert.deepEqual(batchOf(tracker).loops, ['fort']);
});
