import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rig } from './parse-rigs.ts';
import { ContentError } from './read.ts';

function source(): Record<string, unknown> {
  return {
    id: 'man',
    url: 'man.glb',
    clipFolder: 'clips',
    scale: 1,
    yawOffsetDegrees: 0,
    height: 1.8,
    rootMotionBone: null,
    gaits: [{ clip: 'Walk', groundSpeed: 1 }],
    clips: { idle: 'Idle', run: 'Run', hit: ['Hit'], death: ['Death'], actions: {} },
    sockets: { hand_r: { bone: 'hand_r', position: [0, 0, 0], rotationDegrees: [0, 90, 0], scale: 1 } },
    hiddenNodes: [],
    bodyParts: {},
  };
}

void test('a socket reads its bone, offset, turn and scale, and a held piece sits exactly there', (): void => {
  assert.deepEqual(rig(source(), 'rig').sockets, { hand_r: { bone: 'hand_r', position: [0, 0, 0], rotationDegrees: [0, 90, 0], scale: 1 } });
});

void test('a rig with no frame wears nothing framed, and one with a frame names it', (): void => {
  assert.equal(rig(source(), 'rig').frame, '');
  assert.equal(rig({ ...source(), frame: 'man' }, 'rig').frame, 'man');
});

void test('a socket offset that is not three numbers is refused', (): void => {
  assert.throws((): void => {
    rig({ ...source(), sockets: { hand_r: { bone: 'hand_r', position: [0, 0], rotationDegrees: [0, 0, 0], scale: 1 } } }, 'rig');
  }, ContentError);
});

void test('a rig lists the joints that rest on the ground when it lies down, each with a positive radius, and has none unless told', (): void => {
  assert.deepEqual(rig(source(), 'rig').contacts, []);
  const contacts = [
    { bone: 'pelvis', radius: 0.12 },
    { bone: 'hand_l', radius: 0.03 },
  ];
  assert.deepEqual(rig({ ...source(), contacts }, 'rig').contacts, contacts);
  assert.throws((): unknown => rig({ ...source(), contacts: [{ bone: 'pelvis', radius: 0 }] }, 'rig'), ContentError);
});

void test('a rig has no stances unless told, and each stance reads an idle and its own action clips', (): void => {
  const base: Record<string, unknown> = source();
  assert.deepEqual(rig(base, 'rig').clips.stances, {});
  const aim = { idle: 'Aim', actions: { shoot: { clip: 'Shoot', impactFraction: 0.1 } } };
  const stanced: Record<string, unknown> = { ...base, clips: { idle: 'Idle', run: 'Run', hit: ['Hit'], death: ['Death'], actions: {}, stances: { crossbow: aim } } };
  assert.deepEqual(rig(stanced, 'rig').clips.stances, { crossbow: aim });
  const idleless: Record<string, unknown> = { ...base, clips: { idle: 'Idle', run: 'Run', hit: ['Hit'], death: ['Death'], actions: {}, stances: { crossbow: { actions: {} } } } };
  assert.throws((): unknown => rig(idleless, 'rig'), ContentError);
});
