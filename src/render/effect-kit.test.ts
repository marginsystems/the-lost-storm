import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color, Group } from 'three';
import type { VfxImpact, VfxLightning } from '../../sim/content/types.ts';
import type { EffectKit, KitBudget } from './effect-kit.ts';
import { createEffectKit, flashLevel, KIT, KIT_BUDGETS, kitBudget, sparkCount } from './effect-kit.ts';
import type { BurstOptions, ParticleSystem } from './particles.ts';

interface Recorder {
  readonly particles: ParticleSystem;
  readonly bursts: number[];
}

function recorder(): Recorder {
  const bursts: number[] = [];
  return {
    bursts,
    particles: {
      burst(options: BurstOptions): void {
        bursts.push(options.count);
      },
      setDensity(): void {},
      update(): void {},
      clear(): void {},
    },
  };
}

const LOOK: VfxLightning = { forks: 1, glow: 0.5, afterglow: 0.2, jitter: 0.5 };
const HIT: VfxImpact = { sparks: 12, flash: 1.2 };
const BLUE: Color = new Color(0x9be1ff);

function kitWith(budget: KitBudget, record: Recorder, flashes: number[]): EffectKit {
  return createEffectKit(new Group(), record.particles, (_x: number, _y: number, _z: number, _color: Color, intensity: number): void => void flashes.push(intensity), (): KitBudget => budget);
}

void test('a flash of light rises from nothing over its rise and then decays', (): void => {
  assert.equal(flashLevel(0, KIT.flashRise, 9), 0);
  assert.ok(flashLevel(1 / 120, KIT.flashRise, 9) < 0.5);
  assert.ok(Math.abs(flashLevel(KIT.flashRise, KIT.flashRise, 9) - 1) < 1e-9);
  assert.ok(flashLevel(0.5, KIT.flashRise, 9) < 0.02);
  assert.ok(flashLevel(0.2, 0.16, 9) > flashLevel(0.08, 0.16, 9));
});

void test('the phone budget never allows more than the desktop one, and reduced motion drops the trail and the restrike and halves sparks', (): void => {
  const desktop: KitBudget = KIT_BUDGETS.desktop;
  const mobile: KitBudget = KIT_BUDGETS.mobile;
  assert.ok(mobile.strands <= desktop.strands && mobile.groundFlashes <= desktop.groundFlashes && mobile.pending <= desktop.pending);
  assert.ok(mobile.sparkScale <= desktop.sparkScale && mobile.trailScale <= desktop.trailScale);
  const calm: KitBudget = kitBudget('desktop', true);
  assert.equal(calm.trailScale, 0);
  assert.equal(calm.restrike, false);
  assert.equal(calm.sparkScale, desktop.sparkScale * KIT.reducedSparks);
  assert.equal(kitBudget('mobile', false), mobile);
  assert.equal(sparkCount(12, 0.5), 6);
  assert.equal(sparkCount(-3, 1), 0);
});

void test('an impact sprays its sparks scaled by the budget, flashes a light, and a delayed one waits for its time', (): void => {
  const record: Recorder = recorder();
  const flashes: number[] = [];
  const kit: EffectKit = kitWith(KIT_BUDGETS.mobile, record, flashes);
  kit.impact(0, 0, BLUE, HIT, 1, 0);
  assert.deepEqual(record.bursts, [sparkCount(HIT.sparks, KIT_BUDGETS.mobile.sparkScale), KIT.popMotes]);
  assert.deepEqual(flashes, [KIT.impactLight]);
  kit.impact(1, 1, BLUE, HIT, 0.5, 0.1);
  assert.equal(kit.pending, 1);
  kit.update(0.05);
  assert.equal(flashes.length, 1);
  kit.update(0.06);
  assert.equal(kit.pending, 0);
  assert.deepEqual(flashes, [KIT.impactLight, KIT.impactLight * 0.5]);
});

void test('delayed impacts beyond the pending cap fire at once instead of piling up', (): void => {
  const record: Recorder = recorder();
  const flashes: number[] = [];
  const kit: EffectKit = kitWith(KIT_BUDGETS.mobile, record, flashes);
  for (let index: number = 0; index < KIT_BUDGETS.mobile.pending + 5; index += 1) kit.impact(0, 0, BLUE, HIT, 1, 1);
  assert.equal(kit.pending, KIT_BUDGETS.mobile.pending);
  assert.equal(flashes.length, 5);
  kit.clear();
  assert.equal(kit.pending, 0);
});

void test('a carried bolt holds one strand, leaves a capped trail per frame, and lets the strand go when it is dropped', (): void => {
  const record: Recorder = recorder();
  const kit: EffectKit = kitWith(KIT_BUDGETS.desktop, record, []);
  kit.carry(7, 0, 1.25, 0, 1, 0, BLUE, LOOK, 1.2, 1 / 60);
  assert.equal(kit.strands.active, 1);
  kit.carry(7, 40, 1.25, 0, 1, 0, BLUE, LOOK, 1.2, 1 / 60);
  assert.equal(kit.strands.active, 1);
  assert.equal(record.bursts.length, KIT.trailPerFrame);
  kit.drop(7);
  kit.update(LOOK.afterglow + 0.01);
  assert.equal(kit.strands.active, 0);
});

void test('reduced motion leaves no trail behind a carried bolt', (): void => {
  const record: Recorder = recorder();
  const kit: EffectKit = kitWith(kitBudget('desktop', true), record, []);
  for (let step: number = 0; step < 30; step += 1) kit.carry(3, step * 0.5, 1.25, 0, 1, 0, BLUE, LOOK, 1.2, 1 / 60);
  assert.equal(record.bursts.length, 0);
});
