import assert from 'node:assert/strict';
import { test } from 'node:test';
import { delayBetween, pickVariant, pitchRate, VARIATION, volumeScale } from './variation.ts';

void test('a single variation is always chosen and repeats are avoided otherwise', (): void => {
  assert.equal(pickVariant(1, 0, (): number => 0.9), 0);
  for (let count: number = 2; count <= 6; count += 1) {
    for (let previous: number = -1; previous < count; previous += 1) {
      for (let step: number = 0; step < 20; step += 1) {
        const next: number = pickVariant(count, previous, (): number => step / 20);
        assert.ok(next >= 0 && next < count);
        assert.notEqual(next, previous);
      }
    }
  }
});

void test('every variation can come up', (): void => {
  const seen: Set<number> = new Set<number>();
  for (let step: number = 0; step < 100; step += 1) seen.add(pickVariant(4, 1, (): number => step / 100));
  assert.deepEqual([...seen].toSorted((a: number, b: number): number => a - b), [0, 2, 3]);
});

void test('pitch and volume stay inside their spread and are centred on one', (): void => {
  assert.equal(pitchRate((): number => 0.5), 1);
  assert.equal(volumeScale((): number => 0.5), 1);
  const high: number = pitchRate((): number => 1);
  const low: number = pitchRate((): number => 0);
  assert.ok(Math.abs(high - 2 ** (VARIATION.pitchCents / VARIATION.centsPerOctave)) < 1e-9);
  assert.ok(Math.abs(low - 2 ** (-VARIATION.pitchCents / VARIATION.centsPerOctave)) < 1e-9);
  assert.ok(Math.abs(volumeScale((): number => 1) - (1 + VARIATION.volumeSpread)) < 1e-9);
  assert.ok(Math.abs(volumeScale((): number => 0) - (1 - VARIATION.volumeSpread)) < 1e-9);
});

void test('a delay falls between its bounds', (): void => {
  assert.equal(delayBetween(10, 30, (): number => 0), 10);
  assert.equal(delayBetween(10, 30, (): number => 0.5), 20);
  assert.equal(delayBetween(10, 30, (): number => 1), 30);
});
