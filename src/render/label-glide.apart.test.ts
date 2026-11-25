import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LabelGlide } from './label-glide.ts';
import { createGlide, glideToward, LABEL_GLIDE } from './label-glide.ts';

const FRAME: number = 1 / 60;

function covered(frequency: number, frames: number): number {
  const glide: LabelGlide = createGlide();
  glideToward(glide, 0, 0, FRAME, frequency);
  for (let frame: number = 0; frame < frames; frame += 1) glideToward(glide, 0, -30, FRAME, frequency);
  return -glide.y;
}

void test('tags that part to make room cover more of the way in the first 100 ms than tags that follow their anchor', (): void => {
  assert.ok(covered(LABEL_GLIDE.apartFrequency, 6) > covered(LABEL_GLIDE.frequency, 6) + 6);
});

void test('a parting tag is most of the way clear within a 90 ms wait, never overshoots, and settles exactly', (): void => {
  const glide: LabelGlide = createGlide();
  glideToward(glide, 0, 0, FRAME, LABEL_GLIDE.apartFrequency);
  for (let frame: number = 0; frame < 90; frame += 1) {
    glideToward(glide, 0, -30, FRAME, LABEL_GLIDE.apartFrequency);
    assert.ok(glide.y >= -30 - 1e-9);
    if (frame === 4) assert.ok(glide.y < -30 * 0.7, `at ${glide.y}`);
  }
  assert.equal(glide.y, -30);
});

void test('a glide that names no frequency keeps the pace it always had', (): void => {
  const named: LabelGlide = createGlide();
  const plain: LabelGlide = createGlide();
  glideToward(named, 0, 0, FRAME, LABEL_GLIDE.frequency);
  glideToward(plain, 0, 0, FRAME);
  for (let frame: number = 0; frame < 20; frame += 1) {
    glideToward(named, 12, -9, FRAME, LABEL_GLIDE.frequency);
    glideToward(plain, 12, -9, FRAME);
  }
  assert.deepEqual({ x: named.x, y: named.y }, { x: plain.x, y: plain.y });
});
