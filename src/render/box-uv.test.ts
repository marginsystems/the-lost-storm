import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BufferGeometry } from 'three';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { addBoxUvs, boxUv, facingAxis, withBoxUvs } from './box-uv.ts';

function bareBox(): BufferGeometry {
  const box: BoxGeometry = new BoxGeometry(1, 1, 1);
  box.deleteAttribute('uv');
  return box;
}

void test('each face takes the two axes it spans, so a texture lies flat on it in metres', (): void => {
  assert.equal(facingAxis(new Vector3(0.1, 0.9, -0.2)), 'y');
  assert.equal(facingAxis(new Vector3(-0.8, 0.3, 0.1)), 'x');
  assert.equal(facingAxis(new Vector3(0, 0.2, -0.7)), 'z');
  assert.deepEqual(boxUv(new Vector3(1, 2, 3), 'x'), [3, 2]);
  assert.deepEqual(boxUv(new Vector3(1, 2, 3), 'y'), [1, 3]);
  assert.deepEqual(boxUv(new Vector3(1, 2, 3), 'z'), [1, 2]);
});

void test('a model with no UVs gets them in scaled metres, one projection per face, and a model with UVs is left alone', (): void => {
  const made: BufferGeometry = withBoxUvs(bareBox(), new Vector3(2, 2, 2));
  assert.equal(made.index, null);
  const position = made.getAttribute('position');
  const uv = made.getAttribute('uv');
  assert.equal(uv.count, position.count);
  let spread: number = 0;
  for (let index: number = 0; index < uv.count; index += 1) spread = Math.max(spread, Math.abs(uv.getX(index)), Math.abs(uv.getY(index)));
  assert.equal(spread, 1);
  for (let first: number = 0; first < position.count; first += 3) {
    const us: Set<number> = new Set<number>([0, 1, 2].map((offset: number): number => uv.getX(first + offset)));
    const vs: Set<number> = new Set<number>([0, 1, 2].map((offset: number): number => uv.getY(first + offset)));
    assert.ok(us.size > 1 && vs.size > 1, `triangle ${first / 3} collapsed`);
  }
  const textured: BoxGeometry = new BoxGeometry(1, 1, 1);
  assert.equal(withBoxUvs(textured, new Vector3(1, 1, 1)), textured);
});

void test('a loaded scene has every bare mesh projected using its own node scale', (): void => {
  const root: Group = new Group();
  const mesh: Mesh = new Mesh(bareBox(), new MeshStandardMaterial());
  mesh.scale.set(3, 3, 3);
  root.add(mesh);
  addBoxUvs(root);
  const uv = mesh.geometry.getAttribute('uv');
  let spread: number = 0;
  for (let index: number = 0; index < uv.count; index += 1) spread = Math.max(spread, Math.abs(uv.getX(index)));
  assert.equal(spread, 1.5);
});
