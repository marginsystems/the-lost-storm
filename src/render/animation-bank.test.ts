import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnimationClip, AnimationMixer, LoopOnce, Object3D, VectorKeyframeTrack } from 'three';
import type { AnimationAction } from 'three';
import type { AnimationBank } from './animation-bank.ts';
import { animationBank } from './animation-bank.ts';

const FRAME = 1 / 60;
const WALK: AnimationClip = new AnimationClip('walk', 1, [new VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, 4, 0, 0])]);
const SWING: AnimationClip = new AnimationClip('swing', 0.5, [new VectorKeyframeTrack('.position', [0, 0.5], [0, 2, 0, 0, 3, 0])]);

interface Posed {
  readonly body: Object3D;
  readonly mixer: AnimationMixer;
}

function posed(): Posed {
  const body: Object3D = new Object3D();
  const mixer: AnimationMixer = new AnimationMixer(body);
  mixer.clipAction(WALK).play();
  return { body, mixer };
}

function crossToSwing(mixer: AnimationMixer): void {
  const swing: AnimationAction = mixer.clipAction(SWING);
  swing.setLoop(LoopOnce, 1);
  swing.clampWhenFinished = true;
  swing.reset().play();
  mixer.clipAction(WALK).crossFadeTo(swing, 0.2, false);
}

void test('time banked off screen is paid in one step, so the pose on entering view matches a rig that never stopped', (): void => {
  const always: Posed = posed();
  const skipped: Posed = posed();
  const bank: AnimationBank = animationBank();
  for (let frame: number = 0; frame < 50; frame += 1) {
    if (frame === 20) {
      crossToSwing(always.mixer);
      crossToSwing(skipped.mixer);
    }
    always.mixer.update(FRAME);
    const step: number | null = bank.take(FRAME, frame < 5 || frame === 49);
    if (step !== null) skipped.mixer.update(step);
  }
  assert.ok(skipped.body.position.distanceTo(always.body.position) < 1e-9);
  assert.ok(skipped.body.position.y > 2.9);
});

void test('an unseen rig is not stepped at all until it is seen again', (): void => {
  const bank: AnimationBank = animationBank();
  assert.equal(bank.take(FRAME, false), null);
  assert.equal(bank.take(FRAME, false), null);
  const step: number | null = bank.take(FRAME, true);
  assert.ok(step !== null && Math.abs(step - 3 * FRAME) < 1e-12);
  assert.equal(bank.take(FRAME, true), FRAME);
});

void test('an attack that changes speed while unseen is paid at the speed each part was played at', (): void => {
  const always: Posed = posed();
  const skipped: Posed = posed();
  const bank: AnimationBank = animationBank();
  const pay = (): void => {
    const owed: number = bank.owe();
    if (owed > 0) skipped.mixer.update(owed);
  };
  for (let frame: number = 0; frame < 40; frame += 1) {
    if (frame === 10) {
      always.mixer.clipAction(WALK).timeScale = 0.25;
      pay();
      skipped.mixer.clipAction(WALK).timeScale = 0.25;
    }
    always.mixer.update(FRAME);
    const step: number | null = bank.take(FRAME, frame === 39);
    if (step !== null) skipped.mixer.update(step);
  }
  assert.ok(skipped.body.position.distanceTo(always.body.position) < 1e-9);
});

void test('a dropped bank is forgotten, so a revived rig blends from where it is and does not snap', (): void => {
  const bank: AnimationBank = animationBank();
  bank.take(2, false);
  bank.drop();
  assert.equal(bank.owe(), 0);
  assert.equal(bank.take(FRAME, true), FRAME);
});
