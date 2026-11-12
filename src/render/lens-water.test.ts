import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LensDrop, LensState } from './lens-water.ts';
import { anyLensDrop, clearLens, createLensPass, createLensState, kickLens, LENS, lensActive, lensAlpha, lensSize, lensStretch, stepLens } from './lens-water.ts';

function sequence(values: readonly number[]): () => number {
  let index: number = 0;
  return (): number => {
    const value: number = values[index % values.length] ?? 0;
    index += 1;
    return value;
  };
}

function alive(state: LensState): LensDrop[] {
  return state.drops.filter((drop: LensDrop): boolean => drop.alive);
}

void test('the lens is wet only in rain, on a tier that allows it, with the setting on and motion allowed', (): void => {
  const on = { tier: true, setting: true, reducedMotion: false, rain: 0.8 };
  assert.equal(lensActive(on), true);
  assert.equal(lensActive({ ...on, tier: false }), false);
  assert.equal(lensActive({ ...on, setting: false }), false);
  assert.equal(lensActive({ ...on, reducedMotion: true }), false);
  assert.equal(lensActive({ ...on, rain: 0 }), false);
});

void test('drops gather rarely in steady rain and never without rain', (): void => {
  const dry: LensState = createLensState();
  for (let frame: number = 0; frame < 6000; frame += 1) stepLens(dry, 1 / 60, 0, Math.random);
  assert.equal(anyLensDrop(dry), false);
  const wet: LensState = createLensState();
  let most: number = 0;
  for (let frame: number = 0; frame < 3600; frame += 1) {
    stepLens(wet, 1 / 60, 1, sequence([0.3, 0.7, 0.5, 0.9, 0.1, 0.6]));
    most = Math.max(most, alive(wet).length);
  }
  assert.ok(most >= 1);
  assert.ok(most <= 3, `at most a few drops in steady rain, saw ${most}`);
});

void test('a flash or a gust brings a few more drops at once', (): void => {
  const state: LensState = createLensState();
  kickLens(state, LENS.flashKick);
  stepLens(state, 1 / 60, 1, sequence([0.5]));
  assert.equal(alive(state).length, 1);
  assert.ok(state.boost > 0);
  clearLens(state);
  assert.equal(anyLensDrop(state), false);
  assert.equal(state.boost, 0);
});

void test('a drop forms, beads, runs down, stretches and fades away', (): void => {
  const state: LensState = createLensState();
  kickLens(state, 1);
  stepLens(state, 0.001, 1, sequence([0.5, 0.8, 0.5, 0.9, 0.1, 0.5]));
  const drop: LensDrop | undefined = alive(state)[0];
  if (drop === undefined) throw new Error('no drop formed');
  const startY: number = drop.y;
  assert.ok(lensAlpha(drop) < 0.01);
  assert.ok(lensSize(drop) < drop.size);
  let peak: number = 0;
  let longest: number = 1;
  for (let frame: number = 0; frame < 60 * 4; frame += 1) {
    stepLens(state, 1 / 60, 1, sequence([0.99]));
    peak = Math.max(peak, lensAlpha(drop));
    longest = Math.max(longest, lensStretch(drop));
  }
  assert.ok(peak > 0.9);
  assert.ok(drop.y < startY, 'the drop ran down');
  assert.ok(longest > 1, 'a running drop stretches');
  for (let frame: number = 0; frame < 60 * 12; frame += 1) stepLens(state, 1 / 60, 0, sequence([0.99]));
  assert.equal(drop.alive, false);
  assert.equal(lensAlpha(drop), 0);
});

void test('the pass reads the drops into fixed uniforms without growing them', (): void => {
  const lens = createLensPass();
  const state: LensState = createLensState();
  kickLens(state, 1);
  stepLens(state, 1, 1, sequence([0.5]));
  lens.update(state, 16 / 9, 1);
  const drops: unknown = lens.pass.uniforms['uDrops']?.value;
  assert.ok(Array.isArray(drops) && drops.length === LENS.drops);
  assert.equal(lens.pass.uniforms['uAspect']?.value, 16 / 9);
  assert.equal(lens.pass.uniforms['uGlint']?.value, LENS.glint + LENS.flashGlint);
  const stretch: unknown = lens.pass.uniforms['uStretch']?.value;
  assert.ok(Array.isArray(stretch) && stretch.length === LENS.drops);
  lens.dispose();
});
