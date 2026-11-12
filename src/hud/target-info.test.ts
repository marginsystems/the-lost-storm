import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NO_INFO, stepInfo, TARGET_INFO } from './target-info.ts';
import type { InfoState, InfoTarget } from './target-info.ts';

const FRAME: number = 1 / 60;

function run(state: InfoState, targets: readonly (InfoTarget | null)[]): { readonly state: InfoState; readonly flips: number } {
  let now: InfoState = state;
  let flips: number = 0;
  for (const target of targets) {
    const next: InfoState = stepInfo(now, target, FRAME).state;
    if (next.informed !== now.informed) flips += 1;
    now = next;
  }
  return { state: now, flips };
}

function hold(target: InfoTarget | null, seconds: number): (InfoTarget | null)[] {
  return Array.from({ length: Math.round(seconds / FRAME) }, (): InfoTarget | null => target);
}

const brute = (id: number, key: string = 'brute'): InfoTarget => ({ id, kind: 'brute', key, hasLines: true });

void test('the info shows after the hover has rested, and not before', (): void => {
  const early = run(NO_INFO, hold(brute(1), TARGET_INFO.infoDelay - 0.05));
  assert.equal(early.state.informed, false);
  const late = run(early.state, hold(brute(1), 0.1));
  assert.equal(late.state.informed, true);
});

void test('hovering from one monster to another of the same kind in a pack never hides the info', (): void => {
  const settled = run(NO_INFO, hold(brute(1), 0.5)).state;
  const jitter: InfoTarget[] = Array.from({ length: 180 }, (_: unknown, index: number): InfoTarget => brute(1 + (Math.floor(index / 7) % 4), index % 2 === 0 ? 'brute' : 'brute, staggered'));
  const result = run(settled, jitter);
  assert.equal(result.flips, 0);
  assert.equal(result.state.informed, true);
});

void test('a monster of another kind hides the old info, waits, then shows its own', (): void => {
  const settled = run(NO_INFO, hold(brute(1), 0.5)).state;
  const thrower: InfoTarget = { id: 9, kind: 'thrower', key: 'thrower', hasLines: true };
  const switched = stepInfo(settled, thrower, FRAME);
  assert.equal(switched.retarget, true);
  assert.equal(switched.state.informed, false);
  const later = run(switched.state, hold(thrower, TARGET_INFO.fadeOut + TARGET_INFO.infoDelay + 0.05));
  assert.equal(later.state.informed, true);
  assert.equal(later.state.key, 'thrower');
});

void test('losing the target hides the info, and a monster with nothing to say never shows it', (): void => {
  const settled = run(NO_INFO, hold(brute(1), 0.5)).state;
  assert.equal(stepInfo(settled, null, FRAME).state.informed, false);
  const silent = run(NO_INFO, hold({ id: 3, kind: 'mote', key: '[]', hasLines: false }, 1));
  assert.equal(silent.state.informed, false);
});
