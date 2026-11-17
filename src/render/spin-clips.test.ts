import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AnimationAction } from 'three';
import { AnimationClip, AnimationMixer, Object3D } from 'three';
import type { ClipSpin } from './spin-clips.ts';
import { loopDue, startClipSpin } from './spin-clips.ts';

function body(): Object3D {
  const root: Object3D = new Object3D();
  const foot: Object3D = new Object3D();
  foot.name = 'foot_l';
  root.add(foot);
  return root;
}

void test('a clip spin turns around the named foot, or around the hips when it names none', (): void => {
  const root: Object3D = body();
  assert.equal(startClipSpin(root, { start: 'a', loop: 'b', end: 'c', pivot: 'foot_l' }).pivot?.name, 'foot_l');
  assert.equal(startClipSpin(root, { start: 'a', loop: 'b', end: 'c', pivot: 'hips' }).pivot, null);
  assert.equal(startClipSpin(root, { start: 'a', loop: 'b', end: 'c', pivot: 'foot_r' }).pivot, null);
});

void test('the loop takes over only once the wind-in has played to its end, and only once', (): void => {
  const root: Object3D = body();
  const action: AnimationAction = new AnimationMixer(root).clipAction(new AnimationClip('wind', 0.3, []));
  const spin: ClipSpin = startClipSpin(root, { start: 'a', loop: 'b', end: 'c', pivot: 'hips' });
  assert.equal(loopDue(null, action), false);
  action.time = 0.1;
  assert.equal(loopDue(spin, action), false);
  action.time = 0.3;
  assert.equal(loopDue(spin, action), true);
  spin.loop = action;
  assert.equal(loopDue(spin, action), false);
});
