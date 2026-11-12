import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Bone, BufferGeometry, Group, MeshStandardMaterial, Skeleton, SkinnedMesh } from 'three';
import { disposeSkeletons } from './skeletons.ts';

void test('a dropped rig frees the bone texture of every skeleton under it, once each', (): void => {
  const bone: Bone = new Bone();
  const skeleton: Skeleton = new Skeleton([bone]);
  skeleton.computeBoneTexture();
  const body: SkinnedMesh = new SkinnedMesh(new BufferGeometry(), new MeshStandardMaterial());
  const worn: SkinnedMesh = new SkinnedMesh(new BufferGeometry(), new MeshStandardMaterial());
  body.add(bone);
  body.bind(skeleton);
  worn.bind(skeleton);
  const root: Group = new Group();
  root.add(body, worn);
  let freed: number = 0;
  skeleton.boneTexture?.addEventListener('dispose', (): void => {
    freed += 1;
  });
  assert.equal(disposeSkeletons(root), 1);
  assert.equal(freed, 1);
  assert.equal(skeleton.boneTexture, null);
});
