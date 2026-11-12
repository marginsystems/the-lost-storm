import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FlashPhase, FlickerFrame, FlickerState } from './storm-flicker.ts';
import { boltPoints, FLICKER, flashLength, manaStrength, phaseAt, startFlicker, stepFlicker } from './storm-flicker.ts';

function sequence(values: readonly number[]): () => number {
  let index: number = 0;
  return (): number => {
    const value: number = values[index % values.length] ?? 0;
    index += 1;
    return value;
  };
}

void test('a flash is a double flicker: first, a dip, a second, then quiet', (): void => {
  assert.equal(phaseAt(0), 'first');
  assert.equal(phaseAt(FLICKER.firstFor + 0.01), 'dip');
  assert.equal(phaseAt(FLICKER.firstFor + FLICKER.dipFor + 0.01), 'second');
  assert.equal(phaseAt(flashLength()), 'quiet');
  assert.ok(flashLength() < 0.3);
});

void test('quiet gaps between flashes last several seconds and vary', (): void => {
  const short: FlickerState = startFlicker(sequence([0]));
  const long: FlickerState = startFlicker(sequence([0.999]));
  assert.ok(short.wait >= 4);
  assert.ok(long.wait > short.wait + 5);
});

void test('the thread waits out its gap, flashes once through every phase, and goes quiet again', (): void => {
  const random: () => number = sequence([0.5]);
  let state: FlickerState = startFlicker(random);
  let flashes: number = 0;
  const seen: Set<FlashPhase> = new Set<FlashPhase>();
  for (let time: number = 0; time < 8; time += 1 / 60) {
    const frame: FlickerFrame = stepFlicker(state, 1 / 60, 1, random);
    if (frame.fresh) flashes += 1;
    seen.add(frame.phase);
    state = frame.state;
  }
  assert.equal(flashes, 1);
  assert.deepEqual([...seen].toSorted(), ['dip', 'first', 'quiet', 'second']);
});

void test('the thread is weaker as mana drains and never shows when mana is empty', (): void => {
  assert.ok(manaStrength(0.2) < manaStrength(0.9));
  assert.equal(manaStrength(0), 0);
  const random: () => number = sequence([0.5]);
  let state: FlickerState = { wait: 0.01, since: null };
  for (let step: number = 0; step < 600; step += 1) {
    const frame: FlickerFrame = stepFlicker(state, 1 / 60, 0, random);
    assert.equal(frame.phase, 'quiet');
    assert.equal(frame.fresh, false);
    state = frame.state;
  }
});

void test('a thread runs from near the top to the bottom of its box', (): void => {
  const points = boltPoints(sequence([0.2, 0.8, 0.5]), 132, 132);
  assert.ok(points.length > 8);
  assert.ok(points.every((point): boolean => point.x > 0 && point.x < 132 && point.y >= FLICKER.boltTop && point.y < 132));
});
