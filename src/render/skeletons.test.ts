import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Bone, BufferGeometry, Float32BufferAttribute, Group, MeshStandardMaterial, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3 } from 'three';
import type { Object3D, Sphere } from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { boundSkins, disposeSkeletons } from './skeletons.ts';
import { skinnedMeshes } from './wearables.ts';

const SKIN_TOLERANCE = 1e-6;

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

function skinnedTemplate(): Group {
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 2, 0, 0, 0, 4, 0], 3));
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  const bone: Bone = new Bone();
  const mesh: SkinnedMesh = new SkinnedMesh(geometry, new MeshStandardMaterial());
  const root: Group = new Group();
  root.add(bone, mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new Skeleton([bone]));
  return root;
}

function firstSkin(root: Object3D): SkinnedMesh {
  const [found] = skinnedMeshes(root);
  if (found === undefined) throw new Error('no skinned mesh');
  return found;
}

void test('a rig template is bounded once, and every rig cloned from it carries the bounds without skinning its vertices again', (): void => {
  const template: Group = skinnedTemplate();
  assert.equal(boundSkins(template), 1);
  const sphere: Sphere = firstSkin(template).boundingSphere;
  for (const corner of [new Vector3(0, 0, 0), new Vector3(2, 0, 0), new Vector3(0, 4, 0)]) assert.ok(sphere.distanceToPoint(corner) < SKIN_TOLERANCE, `${corner.x},${corner.y}`);
  assert.equal(boundSkins(template), 0);
  const copy: SkinnedMesh = firstSkin(cloneSkinned(template));
  assert.equal(copy.boundingSphere.radius, sphere.radius);
  assert.notEqual(copy.boundingSphere, sphere);
});
