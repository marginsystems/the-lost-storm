import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHART_SKY, skyMotion } from './chart-sky.ts';
import type { SkyMotion } from './chart-sky.ts';

const LEGACY = {
  swayDrifts: 9,
  flowPerDrift: 0.035,
} as const;

const DRIFT_SECONDS: number = CHART_SKY.fallbackDriftMs / 1000;

const GAS_RATES: readonly number[] = [
  CHART_SKY.warpRateA,
  CHART_SKY.warpRateB,
  CHART_SKY.breathRateA,
  CHART_SKY.breathRateB,
  CHART_SKY.flowPerDrift,
];

function peakSwayDegreesPerSecond(swayDrifts: number): number {
  return ((CHART_SKY.sway * 2 * Math.PI) / (swayDrifts * DRIFT_SECONDS)) * (180 / Math.PI);
}

void test('the arms rock at least four times slower than they used to', (): void => {
  assert.ok(peakSwayDegreesPerSecond(CHART_SKY.swayDrifts) <= peakSwayDegreesPerSecond(LEGACY.swayDrifts) / 4);
});

void test('the cloud drifts at least three times slower than it used to', (): void => {
  assert.ok(CHART_SKY.flowPerDrift <= LEGACY.flowPerDrift / 3);
});

void test('every gas rate is its own, so the pattern does not visibly repeat', (): void => {
  for (let first = 0; first < GAS_RATES.length; first++) {
    for (let second = first + 1; second < GAS_RATES.length; second++) {
      const slow: number = Math.min(GAS_RATES[first] ?? 0, GAS_RATES[second] ?? 0);
      const fast: number = Math.max(GAS_RATES[first] ?? 0, GAS_RATES[second] ?? 0);
      const ratio: number = fast / slow;
      assert.ok(Math.abs(ratio - Math.round(ratio)) > 0.02, `rates ${first} and ${second} are near whole multiples`);
    }
  }
});

void test('the sky stands still at time zero', (): void => {
  const motion: SkyMotion = skyMotion(0, DRIFT_SECONDS);
  assert.deepEqual(motion, { flow: 0, sway: 0, warpX: 0, warpY: 0, breathX: 0, breathY: 0 });
});

void test('the sky moves smoothly from one second to the next', (): void => {
  for (let seconds = 0; seconds < 600; seconds += 7) {
    const before: SkyMotion = skyMotion(seconds, DRIFT_SECONDS);
    const after: SkyMotion = skyMotion(seconds + 1, DRIFT_SECONDS);
    assert.ok(Math.abs(after.flow - before.flow) <= CHART_SKY.flowPerDrift / DRIFT_SECONDS + 1e-12);
    assert.ok(Math.abs(after.sway - before.sway) <= (CHART_SKY.sway * 2 * Math.PI) / (CHART_SKY.swayDrifts * DRIFT_SECONDS) + 1e-12);
    assert.ok(Math.abs(after.warpX - before.warpX) <= CHART_SKY.warpRateA / DRIFT_SECONDS + 1e-12);
    assert.ok(Math.abs(after.breathY - before.breathY) <= CHART_SKY.breathRateB / DRIFT_SECONDS + 1e-12);
  }
});

void test('the arms never rock further than the named sway', (): void => {
  for (let seconds = 0; seconds < CHART_SKY.swayDrifts * DRIFT_SECONDS * 2; seconds += 3) {
    assert.ok(Math.abs(skyMotion(seconds, DRIFT_SECONDS).sway) <= CHART_SKY.sway + 1e-12);
  }
});

void test('the sky follows the drift token: a slower token slows every rate in step', (): void => {
  const normal: SkyMotion = skyMotion(100, DRIFT_SECONDS);
  const slower: SkyMotion = skyMotion(100, DRIFT_SECONDS * 2);
  assert.ok(Math.abs(slower.flow * 2 - normal.flow) < 1e-12);
  assert.ok(Math.abs(slower.warpX * 2 - normal.warpX) < 1e-12);
  assert.ok(Math.abs(slower.breathY * 2 - normal.breathY) < 1e-12);
});
