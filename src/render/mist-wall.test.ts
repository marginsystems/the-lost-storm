import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MIST_WALL, buildMistWall, mistWallFrame } from './mist-wall.ts';

void test('a mist wall stands along its line, and its layers step away from the zone', (): void => {
  const frame = mistWallFrame({ from: { x: 0, z: 0 }, to: { x: 0, z: 40 }, height: 9 });
  assert.equal(frame.length, 40);
  assert.equal(frame.midX, 0);
  assert.equal(frame.midZ, 20);
  assert.equal(frame.outX, -1);
  const view = buildMistWall({ from: { x: 0, z: 0 }, to: { x: 0, z: 40 }, height: 9 });
  assert.equal(view.group.children.length, MIST_WALL.layers);
  view.update(3, 0.5);
  view.dispose();
  assert.equal(view.group.parent, null);
});
