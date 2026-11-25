import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from './content.ts';
import { GESTURES, readGestures } from './gestures.ts';
import type { Gestures, PostureDef } from './gestures.ts';
import { ContentError } from './read.ts';
import type { Content } from './types.ts';

function postureNamed(plants: unknown): Gestures {
  const posture: Record<string, unknown> = { id: 'seated', enter: 'Sitting_Enter', exit: 'Sitting_Exit' };
  if (plants !== undefined) posture['plants'] = plants;
  return readGestures({ postures: [posture], gestures: [] }, 'gestures');
}

void test('a posture that names nothing to plant leaves what the body holds in its hand', (): void => {
  assert.deepEqual(must(postureNamed(undefined).postures.get('seated'), 'seated').plants, []);
});

void test('a posture may name held things that stand upright on the floor while the body is in it', (): void => {
  assert.deepEqual(must(postureNamed(['driftwood_staff']).postures.get('seated'), 'seated').plants, ['driftwood_staff']);
});

void test('what a posture plants is a list of names', (): void => {
  assert.throws((): Gestures => postureNamed('driftwood_staff'), ContentError);
});

void test('every held thing a posture plants is an attachment the game knows', (): void => {
  const content: Content = loadContent();
  for (const posture of GESTURES.postures.values()) {
    for (const id of posture.plants) assert.ok(content.attachments.has(id), `posture ${posture.id} plants ${id}, which is not an attachment`);
  }
});

void test('sitting plants the walking staff, so the Wayfarer\'s staff stands beside him and does not cut through his arm', (): void => {
  const seated: PostureDef = must(GESTURES.postures.get('seated'), 'seated');
  assert.ok(seated.plants.includes('driftwood_staff'));
});
