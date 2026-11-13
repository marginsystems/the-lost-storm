import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rig } from './parse-rigs.ts';
import { ContentError } from './read.ts';

function source(restHands: unknown): Record<string, unknown> {
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
    sockets: { hand_r: { bone: 'DEF-hand.R', position: [0, 0, 0], rotationDegrees: [0, 0, 0], scale: 1 } },
    hiddenNodes: [],
    bodyParts: {},
    restHands,
  };
}

void test('a rig with no resting hands leaves every hand to its clips', (): void => {
  assert.deepEqual(rig(source(undefined), 'rig').restHands, {});
});

void test('a resting hand reads a bend for each finger bone of a socket the rig has', (): void => {
  assert.deepEqual(rig(source({ hand_r: { 'DEF-f_index.01.R': [-4, 0, 0] } }), 'rig').restHands, { hand_r: { 'DEF-f_index.01.R': [-4, 0, 0] } });
});

void test('a resting hand on a socket the rig lacks is refused', (): void => {
  assert.throws((): void => {
    rig(source({ hand_x: {} }), 'rig');
  }, ContentError);
});
