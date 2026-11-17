import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Bone, BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Raycaster, Skeleton, SkinnedMesh, Vector3 } from 'three';
import { must } from '../../test/support.ts';
import type { CasterCache, CasterPiece } from './shadow-caster.ts';
import { casterDepth, casterGeometry, castsTogether, createCasterCache, createShadowCaster, drawNothing, drawWhole, isShadowCaster, SHADOW_CASTER } from './shadow-caster.ts';

function triangle(x: number, joint: number): BufferGeometry {
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([x, 0, 0, x + 1, 0, 0, x, 1, 0]), 3));
  geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array([joint, 0, 0, 0, joint, 0, 0, 0, joint, 0, 0, 0]), 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4));
  return geometry;
}

function whole(geometry: BufferGeometry, bindMatrix: Matrix4 = new Matrix4()): CasterPiece {
  return { geometry, bindMatrix, ranges: null };
}

function indexOf(geometry: BufferGeometry): number[] {
  return [...must(geometry.index, 'index').array];
}

function positionsOf(geometry: BufferGeometry): number[] {
  return [...must(geometry.attributes['position'], 'position').array];
}

void test('pieces are joined into one geometry, each keeping its vertices, joints and weights, with indices moved past the pieces before it', (): void => {
  const merged: BufferGeometry = casterGeometry([whole(triangle(0, 1)), whole(triangle(5, 2))], new Matrix4());
  assert.deepEqual(positionsOf(merged), [0, 0, 0, 1, 0, 0, 0, 1, 0, 5, 0, 0, 6, 0, 0, 5, 1, 0]);
  assert.deepEqual(indexOf(merged), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual([...must(merged.attributes['skinIndex'], 'joints').array].filter((_value: number, at: number): boolean => at % 4 === 0), [1, 1, 1, 2, 2, 2]);
  assert.deepEqual([...must(merged.attributes['skinWeight'], 'weights').array].filter((_value: number, at: number): boolean => at % 4 === 0), [1, 1, 1, 1, 1, 1]);
});

void test('an indexed piece keeps its own triangles, and only the ranges that are shown are cast', (): void => {
  const quad: BufferGeometry = triangle(0, 0);
  quad.setIndex([0, 1, 2, 2, 1, 0]);
  const merged: BufferGeometry = casterGeometry([whole(triangle(9, 0)), { geometry: quad, bindMatrix: new Matrix4(), ranges: [{ start: 3, count: 3 }] }], new Matrix4());
  assert.deepEqual(indexOf(merged), [0, 1, 2, 5, 4, 3]);
  const none: BufferGeometry = casterGeometry([{ geometry: quad, bindMatrix: new Matrix4(), ranges: [] }], new Matrix4());
  assert.deepEqual(indexOf(none), []);
});

void test('a piece bound differently from the anchor is carried into the anchor\'s bind space', (): void => {
  const anchorBind: Matrix4 = new Matrix4().makeScale(2, 2, 2);
  const pieceBind: Matrix4 = new Matrix4().makeTranslation(4, 0, 0);
  const merged: BufferGeometry = casterGeometry([whole(triangle(0, 0), pieceBind)], anchorBind);
  assert.deepEqual(positionsOf(merged), [2, 0, 0, 2.5, 0, 0, 2, 0.5, 0]);
  const same: BufferGeometry = casterGeometry([whole(triangle(0, 0), anchorBind)], anchorBind);
  assert.deepEqual(positionsOf(same), [0, 0, 0, 1, 0, 0, 0, 1, 0]);
});

void test('quantised positions and weights are read as the numbers they stand for', (): void => {
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Int16Array([32767, 0, 0, 0, 32767, 0, 0, 0, -32767]), 3, true));
  geometry.setAttribute('skinIndex', new BufferAttribute(new Uint8Array([3, 0, 0, 0, 3, 0, 0, 0, 3, 0, 0, 0]), 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0]), 4, true));
  const merged: BufferGeometry = casterGeometry([whole(geometry)], new Matrix4());
  assert.deepEqual(positionsOf(merged), [1, 0, 0, 0, 1, 0, 0, 0, -1]);
  assert.equal(must(merged.attributes['skinWeight'], 'weights').getX(0), 1);
  assert.equal(must(merged.attributes['skinIndex'], 'joints').getX(0), 3);
});

void test('a piece with no skin is left out, and says so, so it can keep its own shadow', (): void => {
  const bare: BufferGeometry = new BufferGeometry();
  bare.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
  assert.equal(castsTogether(bare), false);
  assert.equal(castsTogether(triangle(0, 0)), true);
  const merged: BufferGeometry = casterGeometry([whole(bare), whole(triangle(7, 0))], new Matrix4());
  assert.deepEqual(positionsOf(merged), [7, 0, 0, 8, 0, 0, 7, 1, 0]);
});

void test('the caster is bound to the anchor\'s skeleton, casts and is marked, and never draws colour, takes a click or receives a shadow', (): void => {
  const bone: Bone = new Bone();
  const anchor: SkinnedMesh = new SkinnedMesh(triangle(0, 0), new MeshStandardMaterial());
  anchor.add(bone);
  anchor.position.set(1, 2, 3);
  anchor.bind(new Skeleton([bone]), new Matrix4().makeScale(3, 3, 3));
  const caster: SkinnedMesh = createShadowCaster(anchor);
  assert.equal(caster.skeleton, anchor.skeleton);
  assert.deepEqual(caster.bindMatrix.elements, anchor.bindMatrix.elements);
  assert.deepEqual(caster.position.toArray(), [1, 2, 3]);
  assert.equal(caster.castShadow, true);
  assert.equal(caster.receiveShadow, false);
  assert.equal(isShadowCaster(caster), true);
  assert.equal(isShadowCaster(anchor), false);
  const material = caster.material;
  assert.equal(Array.isArray(material), false);
  if (!Array.isArray(material)) {
    assert.equal(material.colorWrite, false);
    assert.equal(material.depthWrite, false);
  }
  caster.geometry = casterGeometry([whole(triangle(0, 0))], anchor.bindMatrix);
  const holder: Group = new Group();
  holder.add(caster);
  holder.updateMatrixWorld(true);
  assert.equal(new Raycaster(new Vector3(0.2, 0.2, 5), new Vector3(0, 0, -1)).intersectObject(holder, true).length, 0);
  const plain: Mesh = new Mesh(triangle(0, 0), new MeshStandardMaterial());
  plain.updateMatrixWorld(true);
  assert.equal(new Raycaster(new Vector3(0.2, 0.2, 5), new Vector3(0, 0, -1)).intersectObject(plain, true).length, 1);
  assert.equal(SHADOW_CASTER.offScreen.includes('gl_Position = vec4(2.0, 2.0, 2.0, 1.0)'), true);
});

void test('drawing nothing leaves a range that ends before it starts, and drawing whole restores all of it, whichever caster shares the geometry', (): void => {
  const geometry: BufferGeometry = casterGeometry([whole(triangle(0, 0))], new Matrix4());
  drawNothing(geometry);
  assert.ok(geometry.drawRange.start + geometry.drawRange.count < geometry.drawRange.start);
  drawWhole(geometry);
  assert.equal(geometry.drawRange.start, 0);
  assert.equal(geometry.drawRange.count, Infinity);
});

void test('a caster geometry is built once for everyone who takes it, kept for a while after the last one leaves, and freed when too many stand idle', (): void => {
  let built: number = 0;
  let freed: number = 0;
  const build = (): BufferGeometry => {
    built += 1;
    const geometry: BufferGeometry = casterGeometry([whole(triangle(0, 0))], new Matrix4());
    geometry.addEventListener('dispose', (): void => {
      freed += 1;
    });
    return geometry;
  };
  const cache: CasterCache = createCasterCache(2);
  const first: BufferGeometry = cache.take('a', build);
  assert.equal(cache.take('a', build), first);
  assert.equal(built, 1);
  cache.leave('a');
  cache.leave('a');
  assert.equal(cache.take('a', build), first);
  assert.equal(built, 1);
  cache.leave('a');
  cache.take('b', build);
  cache.leave('b');
  cache.take('c', build);
  cache.leave('c');
  assert.equal(freed, 1);
  assert.equal(cache.size, 2);
  assert.notEqual(cache.take('a', build), first);
  assert.equal(built, 4);
  cache.leave('missing');
  const held: BufferGeometry = cache.take('d', build);
  cache.take('e', build);
  cache.leave('e');
  cache.take('f', build);
  cache.leave('f');
  cache.take('g', build);
  cache.leave('g');
  assert.equal(cache.take('d', build), held);
});


void test('every caster draws its shadow with one depth material of its own kind, so the shadow pass never re-fits a shared one between skinned and rigid meshes', (): void => {
  const anchor: SkinnedMesh = new SkinnedMesh(triangle(0, 0), new MeshStandardMaterial());
  anchor.bind(new Skeleton([new Bone()]));
  const first: SkinnedMesh = createShadowCaster(anchor);
  const second: SkinnedMesh = createShadowCaster(anchor);
  assert.equal(first.customDepthMaterial, casterDepth());
  assert.equal(second.customDepthMaterial, casterDepth());
  assert.equal(anchor.customDepthMaterial, undefined);
});
