import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color, Group, Mesh, ShaderMaterial } from 'three';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import { strandSpan } from './strand-shape.ts';
import type { StrandHandle, StrandLook } from './strands.ts';
import { createStrands, STRAND_FRAGMENT, STRAND_VERTEX, STRANDS } from './strands.ts';

const LOOK: StrandLook = { forks: 2, glow: 0.5, afterglow: 0.2, jitter: 0.5, width: 1, core: 1 };
const BLUE: Color = new Color(0x9be1ff);
const A = { x: 0, y: 1.3, z: 0 } as const;
const B = { x: 5, y: 1.1, z: 1 } as const;

void test('the strand shaders never take pow of an unclamped value or smoothstep with reversed edges', (): void => {
  assert.deepEqual(unsafeGlsl(STRAND_VERTEX), []);
  assert.deepEqual(unsafeGlsl(STRAND_FRAGMENT), []);
});

void test('the pool never holds more strands than its cap, and a new strike takes the oldest one', (): void => {
  const parent: Group = new Group();
  const strands = createStrands(parent, 4);
  assert.equal(parent.children.length, 4);
  for (let index: number = 0; index < 9; index += 1) {
    assert.ok(strands.strike(A, B, BLUE, LOOK, 0, true));
    strands.update(0.01);
  }
  assert.equal(strands.active, 4);
  assert.equal(parent.children.length, 4);
  assert.equal(parent.children.filter((child): boolean => child.visible).length, 4);
});

void test('a strike frees its slot once its span has passed, and a delayed strike waits before it lights', (): void => {
  const parent: Group = new Group();
  const strands = createStrands(parent, 2);
  strands.strike(A, B, BLUE, LOOK, 0.1, false);
  strands.update(0.05);
  assert.equal(strands.active, 1);
  strands.update(strandSpan(LOOK.afterglow) + 0.06);
  assert.equal(strands.active, 0);
  assert.equal(parent.children.filter((child): boolean => child.visible).length, 0);
});

void test('a held strand is never taken by a strike, and the pool says no when every slot is held', (): void => {
  const parent: Group = new Group();
  const strands = createStrands(parent, 2);
  const first: StrandHandle | null = strands.hold(BLUE, LOOK);
  const second: StrandHandle | null = strands.hold(BLUE, LOOK);
  assert.notEqual(first, null);
  assert.notEqual(second, null);
  assert.equal(strands.hold(BLUE, LOOK), null);
  assert.equal(strands.strike(A, B, BLUE, LOOK, 0, true), false);
  first?.fade();
  strands.update(LOOK.afterglow + 0.01);
  assert.equal(strands.active, 1);
  assert.ok(strands.strike(A, B, BLUE, LOOK, 0, true));
  strands.clear();
  assert.equal(strands.active, 0);
});

void test('a look widens its strand and softens its core through the material', (): void => {
  const parent: Group = new Group();
  const strands = createStrands(parent, 1);
  strands.strike(A, B, BLUE, { ...LOOK, width: 2, core: 0.25 }, 0, false);
  const child: unknown = parent.children[0];
  assert.ok(child instanceof Mesh);
  const material: unknown = child.material;
  assert.ok(material instanceof ShaderMaterial);
  assert.equal(material.uniforms['uWidth']?.value, STRANDS.width * 2);
  assert.equal(material.uniforms['uCore']?.value, 0.25);
});
