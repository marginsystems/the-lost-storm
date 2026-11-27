import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Mesh } from 'three';
import { must } from '../../test/support.ts';
import { beatWings, firebirdMesh } from './firebird.ts';

void test('the firebird beats its wings independently of its heading and keeps its breast still', (): void => {
  const bird: Mesh = firebirdMesh();
  const open = bird.geometry.getAttribute('position');
  const folded = must(bird.geometry.morphAttributes.position?.[0], 'downstroke');
  let moved: number = 0;
  for (let index: number = 0; index < open.count; index += 1) {
    if (open.getY(index) !== folded.getY(index)) moved += 1;
    if (open.getX(index) === 0) assert.equal(open.getY(index), folded.getY(index));
  }
  assert.ok(moved > 0 && moved < open.count);
  const weights: number[] = must(bird.morphTargetInfluences, 'wing weights');
  beatWings(bird, 0, 0);
  const first: number = must(weights[0], 'wing phase');
  beatWings(bird, 0.1, 0);
  assert.notEqual(weights[0], first);
  assert.equal(bird.rotation.z, 0);
});
