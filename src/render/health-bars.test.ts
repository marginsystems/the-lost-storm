import assert from 'node:assert/strict';
import { test } from 'node:test';
import { barWanted, endStops, HEALTH_BARS } from './health-bars.ts';
import type { FadeStop } from './health-bars.ts';

void test('a bar shows only for a living monster that has lost life', (): void => {
  assert.equal(barWanted({ alive: true, life: 10, maxLife: 10 }), false);
  assert.equal(barWanted({ alive: true, life: 9, maxLife: 10 }), true);
  assert.equal(barWanted({ alive: false, life: 0, maxLife: 10 }), false);
});

void test('every layer of a bar fades out at both ends instead of stopping in a hard edge', (): void => {
  for (const tone of [HEALTH_BARS.back, HEALTH_BARS.trail, HEALTH_BARS.fill]) {
    const stops: readonly FadeStop[] = endStops(tone, HEALTH_BARS.ends);
    assert.equal(stops[0]?.color, `rgba(${tone.rgb}, 0)`);
    assert.equal(stops[stops.length - 1]?.color, `rgba(${tone.rgb}, 0)`);
    assert.ok(stops.some((stop: FadeStop): boolean => stop.color === `rgba(${tone.rgb}, ${tone.alpha})`));
  }
});
