import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AssetFile } from './asset-versions.ts';
import { ASSET_VERSIONS, assetVersionDefine, versionMap, versionOf } from './asset-versions.ts';

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);

void test('the same bytes always give the same short hex version', (): void => {
  const version: string = versionOf(bytes(1, 2, 3));
  assert.equal(version, versionOf(bytes(1, 2, 3)));
  assert.match(version, new RegExp(`^[0-9a-f]{${String(ASSET_VERSIONS.digestLength)}}$`));
});

void test('changing one byte changes the version', (): void => {
  assert.notEqual(versionOf(bytes(1, 2, 3)), versionOf(bytes(1, 2, 4)));
});

void test('a changed file changes only its own entry', (): void => {
  const before: readonly AssetFile[] = [
    { path: 'models/a.glb', bytes: bytes(1) },
    { path: 'textures/b.webp', bytes: bytes(2) },
  ];
  const after: readonly AssetFile[] = [
    { path: 'models/a.glb', bytes: bytes(9) },
    { path: 'textures/b.webp', bytes: bytes(2) },
  ];
  const old = versionMap(before);
  const next = versionMap(after);
  assert.notEqual(old['models/a.glb'], next['models/a.glb']);
  assert.equal(old['textures/b.webp'], next['textures/b.webp']);
});

void test('the map is ordered by path whatever order the files arrive in', (): void => {
  const files: readonly AssetFile[] = [
    { path: 'textures/b.webp', bytes: bytes(2) },
    { path: 'models/z.glb', bytes: bytes(3) },
    { path: 'models/a.glb', bytes: bytes(1) },
  ];
  const forward: string = JSON.stringify(versionMap(files));
  const backward: string = JSON.stringify(versionMap(files.toReversed()));
  assert.equal(forward, backward);
  assert.deepEqual(Object.keys(versionMap(files)), ['models/a.glb', 'models/z.glb', 'textures/b.webp']);
});

void test('the dev server defines an empty map and reads nothing', (): void => {
  assert.deepEqual(assetVersionDefine('no-such-folder', false), { [ASSET_VERSIONS.global]: '{}' });
});

void test('a build over a missing folder defines an empty map', (): void => {
  assert.deepEqual(assetVersionDefine('no-such-folder', true), { [ASSET_VERSIONS.global]: '{}' });
});
