import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HurtWash } from './hurt-wash.ts';
import { CALM_WASH, HURT_WASH, lowness, stepWash, washHit } from './hurt-wash.ts';

const FRAME: number = 1 / 60;

function settle(wash: HurtWash, share: number, seconds: number): HurtWash {
  let next: HurtWash = wash;
  for (let elapsed: number = 0; elapsed < seconds; elapsed += FRAME) next = stepWash(next, share, FRAME);
  return next;
}

void test('there is no wash at full life or at 63 percent, even right after a hit', (): void => {
  for (const share of [1, 0.63, HURT_WASH.begin + 0.01]) {
    let wash: HurtWash = washHit(CALM_WASH);
    for (let frame: number = 0; frame < 120; frame += 1) {
      wash = stepWash(wash, share, FRAME);
      assert.equal(wash.level, 0, `life ${share}`);
    }
  }
});

void test('the wash only begins below about a third of life and grows as life falls', (): void => {
  assert.equal(lowness(HURT_WASH.begin), 0);
  assert.equal(lowness(HURT_WASH.full), 1);
  const third: number = settle(CALM_WASH, 0.3, 3).level;
  const fifth: number = settle(CALM_WASH, 0.2, 3).level;
  const tenth: number = settle(CALM_WASH, 0.1, 3).level;
  assert.ok(third > 0);
  assert.ok(fifth > third);
  assert.ok(tenth > fifth);
  assert.ok(tenth <= 1);
});

void test('a hit only nudges the wash while life is already low', (): void => {
  const low: HurtWash = settle(CALM_WASH, 0.15, 3);
  const hit: HurtWash = settle(washHit(low), 0.15, 0.2);
  assert.ok(hit.level > low.level);
  const after: HurtWash = settle(hit, 0.15, 3);
  assert.ok(Math.abs(after.level - low.level) < 0.02);
});

void test('the wash eases in and out over many frames, with no jump from one frame to the next', (): void => {
  let wash: HurtWash = CALM_WASH;
  let largest: number = 0;
  let frames: number = 0;
  const shares: number[] = [...Array.from({ length: 180 }, (): number => 0.1), ...Array.from({ length: 240 }, (): number => 0.8)];
  for (const share of shares) {
    const next: HurtWash = stepWash(wash, share, FRAME);
    largest = Math.max(largest, Math.abs(next.level - wash.level));
    if (share < HURT_WASH.begin && next.level < 0.9 * settle(CALM_WASH, 0.1, 3).level) frames += 1;
    wash = next;
  }
  assert.ok(largest < 0.1, `largest step ${largest.toFixed(3)}`);
  assert.ok(frames >= 6, `rose in ${frames} frames`);
  assert.equal(wash.level, 0);
});
