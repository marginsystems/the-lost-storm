import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GROUND_GLOW, glowExtent, rimWidth } from './ground-glow.ts';

void test('the rim keeps one soft width in metres however large the spot, so a big spot never draws a thick band', (): void => {
  assert.equal(rimWidth(3), GROUND_GLOW.rimWidth);
  assert.equal(rimWidth(30), GROUND_GLOW.rimWidth);
});

void test('a small spot narrows its rim so the light stays a ring and not a disc', (): void => {
  assert.ok(rimWidth(0.5) < GROUND_GLOW.rimWidth);
  assert.equal(rimWidth(0.5), 0.5 * GROUND_GLOW.maxRimShare);
});

void test('the drawn square reaches past the rim far enough for its falloff to end at zero', (): void => {
  assert.equal(glowExtent(4), 4 + GROUND_GLOW.rimWidth * GROUND_GLOW.reach);
  assert.ok(glowExtent(1) > 1);
});
