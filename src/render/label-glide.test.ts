import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LabelGlide } from './label-glide.ts';
import { createGlide, glideToward } from './label-glide.ts';

const FRAME: number = 1 / 60;

void test('a glide starts on its first target, so a new tag appears where it belongs', (): void => {
  const glide: LabelGlide = createGlide();
  glideToward(glide, 40, -12, FRAME);
  assert.equal(glide.x, 40);
  assert.equal(glide.y, -12);
});

void test('a tag that must hop 24 px slides there over several frames, never jumping and never overshooting', (): void => {
  const glide: LabelGlide = createGlide();
  glideToward(glide, 0, 0, FRAME);
  let last: number = 0;
  let worstStep: number = 0;
  for (let frame: number = 0; frame < 60; frame += 1) {
    glideToward(glide, 0, -24, FRAME);
    worstStep = Math.max(worstStep, Math.abs(glide.y - last));
    assert.ok(glide.y >= -24 && glide.y <= last + 1e-9, `frame ${frame} at ${glide.y}`);
    last = glide.y;
  }
  assert.ok(worstStep < 24 / 3, `worst step ${worstStep}`);
  assert.equal(glide.y, -24);
  assert.equal(glide.vy, 0);
});

void test('the glide is the same whether frames come at 60 or 120 per second, and a long frame does not throw it', (): void => {
  const at60: LabelGlide = createGlide();
  const at120: LabelGlide = createGlide();
  glideToward(at60, 0, 0, FRAME);
  glideToward(at120, 0, 0, FRAME);
  for (let frame: number = 0; frame < 6; frame += 1) glideToward(at60, 30, 0, FRAME);
  for (let frame: number = 0; frame < 12; frame += 1) glideToward(at120, 30, 0, FRAME / 2);
  assert.ok(Math.abs(at60.x - at120.x) < 1e-9);
  const long: LabelGlide = createGlide();
  glideToward(long, 0, 0, FRAME);
  glideToward(long, 30, 0, 0.5);
  assert.ok(long.x > 29 && long.x <= 30);
});

void test('a glide with nothing to correct stays put, and a paused frame changes nothing', (): void => {
  const glide: LabelGlide = createGlide();
  glideToward(glide, 5, 5, FRAME);
  glideToward(glide, 5, 5, FRAME);
  assert.deepEqual({ x: glide.x, y: glide.y }, { x: 5, y: 5 });
  glideToward(glide, 50, 5, 0);
  assert.equal(glide.x, 5);
});
