import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AnimationClip, AnimationMixer, Bone, Group, Quaternion, QuaternionKeyframeTrack, Vector3 } from 'three';
import type { RigDef } from '../../sim/content/types.ts';
import { idleWeight, relaxHands, restHands } from './rest-hands.ts';
import type { RestFinger, RestHand } from './rest-hands.ts';

interface Hand {
  readonly model: Group;
  readonly finger: Bone;
  readonly hands: readonly RestHand[];
}

const CURLED: Quaternion = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -1.2);
const BENT: Quaternion = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 18);

function hand(): Hand {
  const model: Group = new Group();
  const finger: Bone = new Bone();
  finger.name = 'DEF-f_index01R';
  model.add(finger);
  const def: Pick<RigDef, 'restHands'> = { restHands: { hand_r: { 'DEF-f_index.01.R': [-10, 0, 0], 'DEF-f_absent.01.R': [0, 0, 0] } } };
  return { model, finger, hands: restHands(model, { ...base(), ...def }) };
}

function base(): RigDef {
  return { id: 'man', url: '', clipFolder: '', scale: 1, yawOffsetDegrees: 0, height: 1.8, rootMotionBone: null, gaits: [], clips: { idle: 'Idle', run: 'Run', hit: ['Hit'], death: ['Death'], rise: null, actions: {}, unarmed: null }, sockets: {}, hiddenNodes: [], idleRate: 1, bodyParts: {}, base: [], restHands: {} };
}

void test('a resting hand keeps the fingers the rig names and the bend set on top of the bind pose', (): void => {
  const { hands } = hand();
  const fingers: readonly RestFinger[] = hands.flatMap((entry: RestHand): readonly RestFinger[] => entry.fingers);
  assert.equal(fingers.length, 1);
  assert.ok(fingers.every((finger: RestFinger): boolean => finger.rest.angleTo(BENT) < 1e-6));
});

void test('a free hand settles into its rest as far as the idle weighs, and a hand that holds something keeps the clip', (): void => {
  const { finger, hands } = hand();
  finger.quaternion.copy(CURLED);
  relaxHands(hands, 1, new Set<string>(['hand_r']));
  assert.ok(finger.quaternion.angleTo(CURLED) < 1e-6);
  relaxHands(hands, 0, new Set<string>());
  assert.ok(finger.quaternion.angleTo(CURLED) < 1e-6);
  relaxHands(hands, 1, new Set<string>());
  assert.ok(finger.quaternion.angleTo(BENT) < 1e-6);
});

void test('the idle weight counts only idle clips the mixer is playing', (): void => {
  const { model } = hand();
  const mixer: AnimationMixer = new AnimationMixer(model);
  const track: QuaternionKeyframeTrack = new QuaternionKeyframeTrack('DEF-f_index01R.quaternion', [0], [0, 0, 0, 1]);
  const idle: AnimationClip = new AnimationClip('Idle', 1, [track]);
  const swing: AnimationClip = new AnimationClip('Swing', 1, [track]);
  assert.equal(idleWeight(mixer, [idle]), 0);
  mixer.clipAction(swing).play();
  mixer.update(0);
  assert.equal(idleWeight(mixer, [idle]), 0);
  mixer.clipAction(idle).play();
  mixer.update(0);
  assert.equal(idleWeight(mixer, [idle]), 1);
});
