import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GestureDef, Gestures } from './gestures.ts';
import { GESTURES, gestureClips, gestureOf, readGestures } from './gestures.ts';
import { ContentError } from './read.ts';

const SEATED = { id: 'seated', enter: 'Sitting_Enter', exit: 'Sitting_Exit' } as const;

function plays(id: string): string | null {
  return gestureOf(id)?.plays ?? null;
}

function read(gestures: unknown[]): Gestures {
  return readGestures({ postures: [SEATED], gestures }, 'test');
}

void test('the gestures name a one-shot, a held loop or a posture for every act the resident needs', (): void => {
  for (const id of ['nod', 'shake', 'call', 'point', 'touch', 'drink']) assert.equal(plays(id), 'once', id);
  for (const id of ['talk', 'arms_folded', 'crouch']) assert.equal(plays(id), 'hold', id);
  for (const id of ['sit', 'sit_talk']) assert.equal(plays(id), 'posture', id);
});

void test('sitting and talking while seated share one posture, so a seated body never stands to change loops', (): void => {
  const sit: GestureDef | null = gestureOf('sit');
  const talk: GestureDef | null = gestureOf('sit_talk');
  assert.ok(sit?.plays === 'posture' && talk?.plays === 'posture');
  assert.equal(sit.posture, talk.posture);
  assert.deepEqual(sit.posture, { ...SEATED, plants: ['driftwood_staff'] });
  assert.equal(sit.clip, 'Sitting_Idle_Loop');
  assert.equal(talk.clip, 'Sitting_Talking_Loop');
});

void test('an unknown id, a non-string or an empty act is no gesture', (): void => {
  assert.equal(gestureOf('wave'), null);
  assert.equal(gestureOf(''), null);
  assert.equal(gestureOf(7), null);
  assert.equal(gestureOf(null), null);
  assert.equal(gestureOf('__proto__'), null);
});

void test('every clip a gesture plays is listed once, the posture enter and exit among them', (): void => {
  const clips: string[] = gestureClips();
  assert.equal(new Set<string>(clips).size, clips.length);
  for (const clip of ['Yes', 'Idle_No_Loop', 'Idle_Rail_Call', 'Interact', 'Consume', 'Idle_Talking_Loop', 'Idle_FoldArms_Loop', 'Crouch_Idle_Loop', 'Sitting_Enter', 'Sitting_Idle_Loop', 'Sitting_Talking_Loop', 'Sitting_Exit']) assert.ok(clips.includes(clip), clip);
  assert.equal(clips.length, 12);
});

void test('the reader refuses a posture nobody defined, an unknown way to play, a duplicate and a badly formed id', (): void => {
  assert.throws((): Gestures => read([{ id: 'lie', plays: 'posture', posture: 'lying', clip: 'X' }]), ContentError);
  assert.throws((): Gestures => read([{ id: 'wave', plays: 'twice', clip: 'X' }]), ContentError);
  assert.throws((): Gestures => read([{ id: 'nod', plays: 'once', clip: 'X' }, { id: 'nod', plays: 'hold', clip: 'Y' }]), ContentError);
  assert.throws((): Gestures => read([{ id: 'Nod', plays: 'once', clip: 'X' }]), ContentError);
  assert.throws((): Gestures => read([{ id: 'n'.repeat(33), plays: 'once', clip: 'X' }]), ContentError);
  assert.throws((): Gestures => read([{ id: 'nod', plays: 'once' }]), ContentError);
  assert.equal(read([{ id: 'nod', plays: 'once', clip: 'X' }]).gestures.size, 1);
});

void test('the shipped gestures are the ones the data file names', (): void => {
  assert.equal(GESTURES.gestures.size, 11);
  assert.equal(GESTURES.postures.size, 1);
});
