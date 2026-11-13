import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import { CHART_SKY, driftMs, SKY_FRAGMENT, skyMotion } from './chart-sky.ts';
import { armShape } from './chart-storm.ts';
import { CHART_VIEW } from './chart-view.ts';
import { TREE_NODES } from './tree-nodes.ts';

const content: Content = loadContent();
const DRIFT_SECONDS: number = CHART_SKY.fallbackDriftMs / 1000;
const BOUNDS = {
  fastestPixelsPerSecond: 3,
  slowestPixelsPerSecond: 0.3,
  tailReach: 1.3,
  week: 7 * 24 * 3600,
} as const;

function linesWith(word: string): string[] {
  return SKY_FRAGMENT.split('\n')
    .map((line: string): string => line.trim())
    .filter((line: string): boolean => new RegExp(`\\b${word}\\b`).test(line));
}

function fastestArmPixelsPerSecond(drift: number): number {
  const along: number = CHART_SKY.flowPerDrift / drift / CHART_SKY.streakScale;
  const farthest: number = Math.max(...content.chart.paths.map((path): number => armShape(content, path.id).reach)) * BOUNDS.tailReach;
  const spiral: number = Math.hypot(1, content.chart.twist * farthest);
  return along * spiral * TREE_NODES.unit * CHART_VIEW.openScale;
}

void test('the clock reaches the sky through one value, and only the gas brightness reads it', (): void => {
  assert.deepEqual(Object.keys(skyMotion(12, DRIFT_SECONDS)), ['phase']);
  assert.deepEqual(linesWith('phase'), ['uniform float phase;', `float body = mix(billow, streakAt(r, heading, gas, phase), ${CHART_SKY.streakMix});`]);
  for (const line of linesWith('body')) {
    assert.ok(!/float (d|q|band|tail|share|shape|cloud|wall|mass) =/.test(line), `arm geometry reads the flowing gas: ${line}`);
  }
});

void test('an arm centre line at any radius is the same at time zero and at any later time', (): void => {
  const offset: string[] = linesWith('armOffset');
  assert.ok(offset.includes('float armOffset(float th, float r, float base) {'));
  const body: string = SKY_FRAGMENT.slice(SKY_FRAGMENT.indexOf('float armOffset('), SKY_FRAGMENT.indexOf('}', SKY_FRAGMENT.indexOf('float armOffset(')));
  assert.equal(body.includes('phase'), false);
  assert.match(body, /wrapAngle\(th - base - twist \* r\)/);
  for (const seconds of [0, 1, 60, 3600, BOUNDS.week]) {
    assert.deepEqual(Object.keys(skyMotion(seconds, DRIFT_SECONDS)), ['phase']);
  }
});

void test('the gas flows along each arm no faster than a few pixels a second at the opening zoom, and never stops', (): void => {
  const fastest: number = fastestArmPixelsPerSecond(DRIFT_SECONDS);
  assert.ok(fastest <= BOUNDS.fastestPixelsPerSecond, `fastest ${fastest} px/s`);
  assert.ok(fastest >= BOUNDS.slowestPixelsPerSecond, `fastest ${fastest} px/s`);
});

void test('the flow is the same at any frame rate and has no loop point or jump', (): void => {
  const rate: number = skyMotion(1, DRIFT_SECONDS).phase;
  for (const fps of [24, 30, 60, 120, 144]) {
    let seconds: number = 0;
    let previous: number = skyMotion(0, DRIFT_SECONDS).phase;
    for (let frame = 0; frame < fps * 10; frame++) {
      seconds += 1 / fps;
      const now: number = skyMotion(seconds, DRIFT_SECONDS).phase;
      assert.ok(Math.abs(now - previous - rate / fps) < 1e-9);
      previous = now;
    }
    assert.ok(Math.abs(previous - rate * 10) < 1e-9);
  }
  for (const seconds of [0, 59, 3599, 86399, BOUNDS.week]) {
    assert.ok(Math.abs(skyMotion(seconds + 1, DRIFT_SECONDS).phase - skyMotion(seconds, DRIFT_SECONDS).phase - rate) < 1e-9);
  }
});

void test('the drift token reads the same from the dev stylesheet and the minified build, which writes 5.2s', (): void => {
  assert.equal(driftMs('5200ms'), 5200);
  assert.equal(skyMotion(60, driftMs('5.2s') / 1000).phase, skyMotion(60, driftMs('5200ms') / 1000).phase);
  assert.equal(driftMs(' 5200ms '), 5200);
  assert.equal(driftMs('5.2s'), 5200);
  assert.equal(driftMs(''), CHART_SKY.fallbackDriftMs);
  assert.equal(driftMs('5.2'), CHART_SKY.fallbackDriftMs);
  assert.equal(driftMs('5.2ms'), CHART_SKY.fallbackDriftMs);
  assert.equal(driftMs('9999s'), CHART_SKY.fallbackDriftMs);
});

void test('a slower drift token slows the flow in step', (): void => {
  assert.ok(Math.abs(skyMotion(100, DRIFT_SECONDS * 2).phase * 2 - skyMotion(100, DRIFT_SECONDS).phase) < 1e-12);
  assert.ok(fastestArmPixelsPerSecond(DRIFT_SECONDS * 2) < fastestArmPixelsPerSecond(DRIFT_SECONDS));
});

void test('the sky shader has no unclamped powers or reversed smoothsteps', (): void => {
  assert.deepEqual(unsafeGlsl(SKY_FRAGMENT), []);
});
