import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Mesh, ShaderMaterial } from 'three';
import { renderBudget } from '../mobile/quality.ts';
import { buildMistWall, mistWallFrame } from './mist-wall.ts';

void test('a mist wall stands along its line, and its layers step away from the zone', (): void => {
  const frame = mistWallFrame({ from: { x: 0, z: 0 }, to: { x: 0, z: 40 }, height: 9 });
  assert.equal(frame.length, 40);
  assert.equal(frame.midX, 0);
  assert.equal(frame.midZ, 20);
  assert.equal(frame.outX, -1);
  const view = buildMistWall({ from: { x: 0, z: 0 }, to: { x: 0, z: 40 }, height: 9 });
  assert.equal(view.group.children.length, renderBudget().mistLayers);
  view.update(3, 0.5);
  view.dispose();
  assert.equal(view.group.parent, null);
});

void test('the mist noise never takes the sine of a large number, so no GPU draws it as static near the camera', (): void => {
  const view = buildMistWall({ from: { x: 0, z: 0 }, to: { x: 0, z: 72 }, height: 7 });
  const shaders: string[] = view.group.children.flatMap((child): string[] => child instanceof Mesh && child.material instanceof ShaderMaterial ? [child.material.fragmentShader] : []);
  assert.equal(shaders.length, renderBudget().mistLayers);
  for (const shader of shaders) assert.doesNotMatch(shader, /sin\(/);
  view.dispose();
});
