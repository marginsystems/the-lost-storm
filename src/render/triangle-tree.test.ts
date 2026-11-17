import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BufferGeometry, Intersection, Material, Side } from 'three';
import { BackSide, BoxGeometry, DoubleSide, FrontSide, Group, IcosahedronGeometry, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Raycaster, TorusKnotGeometry, Vector3 } from 'three';
import { meshBlocks, prepareTrees } from './triangle-tree.ts';

function seeded(seed: number): () => number {
  let state: number = seed;
  return (): number => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function placed(geometry: BufferGeometry, material: Material | Material[], random: () => number): Mesh {
  const mesh: Mesh = new Mesh(geometry, material);
  const turn: Quaternion = new Quaternion().setFromAxisAngle(new Vector3(random(), random(), random()).normalize(), random() * 6);
  mesh.matrixWorld.compose(new Vector3(random() * 2 - 1, random() * 2, random() * 2 - 1), turn, new Vector3(0.5 + random(), 0.5 + random() * 2, 0.5 + random()));
  return mesh;
}

function plain(side: Side): Material {
  return new MeshBasicMaterial({ side });
}

function mixed(side: Side): Material[] {
  return [FrontSide, BackSide, DoubleSide, side, FrontSide, BackSide].map((each: Side): Material => new MeshBasicMaterial({ side: each }));
}

function raycastBlocks(mesh: Mesh, raycaster: Raycaster): boolean {
  const hits: Intersection[] = [];
  mesh.raycast(raycaster, hits);
  return hits.length > 0;
}

function compare(geometry: BufferGeometry, materialFor: (side: Side) => Material | Material[], seed: number): number {
  const random: () => number = seeded(seed);
  const raycaster: Raycaster = new Raycaster();
  const hits: Intersection[] = [];
  let blocked: number = 0;
  for (const side of [FrontSide, BackSide, DoubleSide]) {
    for (let trial: number = 0; trial < 40; trial += 1) {
      const mesh: Mesh = placed(geometry, materialFor(side), random);
      for (let ray: number = 0; ray < 25; ray += 1) {
        const from: Vector3 = new Vector3(random() * 8 - 4, random() * 4 - 1, random() * 8 - 4);
        const towards: Vector3 = new Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1).normalize();
        raycaster.set(from, towards);
        raycaster.far = random() < 0.5 ? Infinity : random() * 6;
        const expected: boolean = raycastBlocks(mesh, raycaster);
        assert.equal(meshBlocks(mesh, raycaster, hits), expected, `side ${String(side)} trial ${String(trial)} ray ${String(ray)}`);
        if (expected) blocked += 1;
      }
    }
  }
  return blocked;
}

void test('the tree answers exactly as a full raycast for indexed and unindexed meshes on every side, near and far', (): void => {
  assert.ok(compare(new IcosahedronGeometry(1, 3), plain, 7) > 100);
  assert.ok(compare(new TorusKnotGeometry(0.8, 0.25, 64, 8), plain, 11) > 100);
  assert.ok(compare(new TorusKnotGeometry(0.8, 0.25, 48, 6).toNonIndexed(), plain, 13) > 100);
});

void test('a mesh with a material per group takes each face side from its own group', (): void => {
  assert.ok(compare(new BoxGeometry(1.5, 2, 1, 3, 4, 2), mixed, 17) > 100);
});

void test('a moved or reshaped geometry is measured again before the next answer', (): void => {
  const geometry: BoxGeometry = new BoxGeometry(1, 1, 1);
  const mesh: Mesh = new Mesh(geometry, new MeshBasicMaterial());
  mesh.updateMatrixWorld();
  const raycaster: Raycaster = new Raycaster(new Vector3(0, 0, -5), new Vector3(0, 0, 1));
  const hits: Intersection[] = [];
  assert.equal(meshBlocks(mesh, raycaster, hits), true);
  geometry.translate(5, 0, 0);
  assert.equal(meshBlocks(mesh, raycaster, hits), false);
  geometry.setDrawRange(0, 0);
  geometry.translate(-5, 0, 0);
  assert.equal(meshBlocks(mesh, raycaster, hits), false);
  geometry.setDrawRange(0, Infinity);
  assert.equal(meshBlocks(mesh, raycaster, hits), true);
});

void test('preparing measures every plain mesh once and leaves other objects to the raycaster', (): void => {
  const mesh: Mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  assert.equal(prepareTrees([mesh, new Group()]), 1);
  mesh.matrixWorld.copy(new Matrix4().makeTranslation(0, 0, 3));
  const raycaster: Raycaster = new Raycaster(new Vector3(0, 0, 0), new Vector3(0, 0, 1));
  raycaster.far = 2;
  assert.equal(meshBlocks(mesh, raycaster, []), false);
  raycaster.far = 3;
  assert.equal(meshBlocks(mesh, raycaster, []), true);
});
