import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bone, BufferAttribute, BufferGeometry, MeshBasicMaterial, Skeleton, SkinnedMesh } from 'three';
import { cornerMask, groupBodies, maskHidden, partMasks } from './wearables.ts';
import type { GeometryGroup } from 'three';
import type { BodyGroupings } from './wearables.ts';

const PARTS: readonly string[] = ['head', 'torso', 'arms', 'hands', 'legs', 'feet'];

void test('every mix of parts has its own group', (): void => {
  assert.equal(partMasks(PARTS.length), 64);
  assert.equal(cornerMask([1, 1, 1]), 2);
  assert.equal(cornerMask([1, 1, 4]), 18);
});

void test('a triangle touching skin that belongs to no part is never hidden', (): void => {
  assert.equal(cornerMask([1, 1, -1]), 0);
  assert.equal(maskHidden(0, PARTS, PARTS), false);
});

void test('a neck triangle between torso and head stays while the head shows, so a coat cuts no teeth into the neck', (): void => {
  const neck: number = cornerMask([1, 1, 0]);
  assert.equal(maskHidden(neck, PARTS, ['torso', 'arms']), false);
  assert.equal(maskHidden(neck, PARTS, ['head', 'torso']), true);
});

void test('a waist triangle between torso and legs hides when both are covered', (): void => {
  const waist: number = cornerMask([1, 4, 4]);
  assert.equal(maskHidden(waist, PARTS, ['torso', 'arms', 'legs']), true);
  assert.equal(maskHidden(waist, PARTS, ['torso']), false);
});

function skinnedOn(name: string, bone: number, triangles: number, skeleton: Skeleton): SkinnedMesh {
  const vertices: number = triangles * 3;
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices * 3), 3));
  geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(vertices * 4).map((_: number, slot: number): number => (slot % 4 === 0 ? bone : 0)), 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(new Float32Array(vertices * 4).map((_: number, slot: number): number => (slot % 4 === 0 ? 1 : 0)), 4));
  geometry.setIndex(Array.from({ length: vertices }, (_: unknown, corner: number): number => corner));
  const mesh: SkinnedMesh = new SkinnedMesh(geometry, new MeshBasicMaterial());
  mesh.name = name;
  mesh.bind(skeleton);
  return mesh;
}

void test('every body mesh keeps its own groups, so a list on the body is not lost to the eyes grouped after it', (): void => {
  const spine: Bone = new Bone();
  spine.name = 'DEF-spine';
  const head: Bone = new Bone();
  head.name = 'DEF-head';
  const skeleton: Skeleton = new Skeleton([spine, head]);
  const body: SkinnedMesh = skinnedOn('body', 0, 2, skeleton);
  const eyes: SkinnedMesh = skinnedOn('eyes', 1, 1, skeleton);
  const grouped: BodyGroupings = groupBodies([body, eyes], { torso: ['DEF-spine'], head: ['DEF-head'] }, (mesh: SkinnedMesh): readonly (readonly string[])[] => (mesh === body ? [['cover:coat'], []] : []));
  assert.deepEqual(grouped.names, ['torso', 'head']);
  assert.equal(grouped.groups.get('body')?.some((group: { readonly covers: readonly string[] }): boolean => group.covers.includes('cover:coat')), true);
  assert.equal(grouped.groups.get('eyes')?.some((group: { readonly covers: readonly string[] }): boolean => group.covers.length > 0), false);
  for (const mesh of [body, eyes]) {
    const count: number = grouped.groups.get(mesh.name)?.length ?? 0;
    assert.equal(mesh.geometry.groups.every((group: GeometryGroup): boolean => (group.materialIndex ?? 0) < count), true);
  }
});
