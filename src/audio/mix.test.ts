import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Placement } from './mix.ts';
import { distanceGain, MIX, panFor, placement } from './mix.ts';

void test('sounds near the hero are at full volume and far ones fade to nothing', (): void => {
  assert.equal(distanceGain(0), 1);
  assert.equal(distanceGain(MIX.nearDistance), 1);
  assert.equal(distanceGain(MIX.farDistance), 0);
  assert.equal(distanceGain(MIX.farDistance + 50), 0);
  let previous: number = 1;
  for (let distance: number = MIX.nearDistance; distance <= MIX.farDistance; distance += 1) {
    const gain: number = distanceGain(distance);
    assert.ok(gain <= previous);
    previous = gain;
  }
});

void test('panning follows the side of the screen and stays within range', (): void => {
  assert.equal(panFor(0), 0);
  assert.ok(panFor(0.5) > 0);
  assert.ok(panFor(-0.5) < 0);
  assert.equal(panFor(-0.5), -panFor(0.5));
  assert.equal(panFor(10), 1);
  assert.equal(panFor(-10), -1);
});

void test('a sound too far to hear has no placement', (): void => {
  assert.equal(placement(MIX.farDistance, 0), null);
  assert.equal(placement(MIX.farDistance - 0.5, 0), null);
  const near: Placement | null = placement(2, -0.4);
  assert.ok(near !== null);
  assert.equal(near.gain, 1);
  assert.ok(near.pan < 0);
});

void test('a sound with a longer reach is still heard across a zone, quietly, where a plain one is silent', (): void => {
  const reach: number = 90;
  const across: number = 70;
  const beside: number = 6;
  assert.equal(placement(across, 0), null);
  const far: Placement | null = placement(across, 0, reach);
  const near: Placement | null = placement(beside, 0, reach);
  assert.ok(far !== null && near !== null);
  assert.ok(far.gain < near.gain / 10, `${far.gain} against ${near.gain}`);
  assert.equal(placement(reach, 0, reach), null);
  assert.equal(distanceGain(MIX.nearDistance, reach), 1);
});
