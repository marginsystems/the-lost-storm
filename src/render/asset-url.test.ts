import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AssetVersions } from './asset-url.ts';
import { readAssetVersions, versionedUrl } from './asset-url.ts';

const VERSIONS: AssetVersions = new Map<string, string>([
  ['models/wear/man/ranger.glb', '0a1b2c3d4e'],
  ['textures/cobble_color.webp', 'ffee001122'],
]);

void test('a file in the map is asked for with its version', (): void => {
  assert.equal(versionedUrl('/', 'models/wear/man/ranger.glb', VERSIONS), '/models/wear/man/ranger.glb?v=0a1b2c3d4e');
  assert.equal(versionedUrl('/game/', 'textures/cobble_color.webp', VERSIONS), '/game/textures/cobble_color.webp?v=ffee001122');
});

void test('a file not in the map keeps its bare path', (): void => {
  assert.equal(versionedUrl('/', 'models/world/coins.glb', VERSIONS), '/models/world/coins.glb');
});

void test('with no map every path stays bare, as on the dev server and in tests', (): void => {
  assert.equal(versionedUrl('/', 'models/wear/man/ranger.glb', new Map<string, string>()), '/models/wear/man/ranger.glb');
});

void test('a leading slash still finds the version', (): void => {
  assert.equal(versionedUrl('', '/models/wear/man/ranger.glb', VERSIONS), '/models/wear/man/ranger.glb?v=0a1b2c3d4e');
});

void test('a path that already carries a query keeps it', (): void => {
  const withQuery: AssetVersions = new Map<string, string>([['models/a.glb?x=1', 'abc']]);
  assert.equal(versionedUrl('/', 'models/a.glb?x=1', withQuery), '/models/a.glb?x=1&v=abc');
});

void test('the built map is read defensively', (): void => {
  assert.equal(readAssetVersions(undefined).size, 0);
  assert.equal(readAssetVersions(null).size, 0);
  assert.equal(readAssetVersions(['models/a.glb']).size, 0);
  assert.equal(readAssetVersions('models/a.glb').size, 0);
  const read: AssetVersions = readAssetVersions({ 'models/a.glb': '0a1b', 'models/b.glb': 7, 'models/c.glb': 'not hex', 'models/d.glb': '' });
  assert.deepEqual([...read], [['models/a.glb', '0a1b']]);
});
