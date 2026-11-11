import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AssetManifest } from './manifest.ts';
import { assetUrl, parseManifest, readAssetBase } from './manifest.ts';

void test('only an http or https base is accepted and it ends with a slash', (): void => {
  assert.equal(readAssetBase(undefined), null);
  assert.equal(readAssetBase(''), null);
  assert.equal(readAssetBase('   '), null);
  assert.equal(readAssetBase(42), null);
  assert.equal(readAssetBase('not a url'), null);
  assert.equal(readAssetBase('file:///etc/passwd'), null);
  assert.equal(readAssetBase('javascript:alert(1)'), null);
  assert.equal(readAssetBase('http://localhost:5210'), 'http://localhost:5210/');
  assert.equal(readAssetBase(' https://sounds.example/storm/ '), 'https://sounds.example/storm/');
  assert.equal(readAssetBase('https://sounds.example/storm?x=1#y'), 'https://sounds.example/storm/');
});

void test('an asset url stays under the base', (): void => {
  const base: string = 'https://sounds.example/storm/';
  assert.equal(assetUrl(base, 'manifest.json'), 'https://sounds.example/storm/manifest.json');
  assert.equal(assetUrl(base, 'build/combat/hit_bone_1.ogg'), 'https://sounds.example/storm/build/combat/hit_bone_1.ogg');
  for (const bad of ['/etc/passwd', '../x.ogg', 'build/../../x.ogg', 'https://evil.example/x.ogg', '//evil.example/x.ogg', 'build\\x.ogg', 'a b.ogg', '']) {
    assert.equal(assetUrl(base, bad), null, bad);
  }
});

void test('a manifest is read, and anything else is refused or skipped', (): void => {
  const manifest: AssetManifest | null = parseManifest({ sfx: { bone_hit: ['a.ogg', 'b.ogg'], empty: [], wrong: 'a.ogg', mixed: ['a.ogg', 3] }, voice: { greeting: 'voice/x/greeting.mp3', broken: 7 } });
  assert.ok(manifest !== null);
  assert.deepEqual(manifest.sfx.get('bone_hit'), ['a.ogg', 'b.ogg']);
  assert.equal(manifest.sfx.has('empty'), false);
  assert.equal(manifest.sfx.has('wrong'), false);
  assert.equal(manifest.sfx.has('mixed'), false);
  assert.equal(manifest.voice.get('greeting'), 'voice/x/greeting.mp3');
  assert.equal(manifest.voice.has('broken'), false);
  assert.equal(parseManifest(null), null);
  assert.equal(parseManifest([]), null);
  assert.equal(parseManifest({ sfx: [] }), null);
  assert.equal(parseManifest({ voice: {} }), null);
  assert.deepEqual(parseManifest({ sfx: {} })?.voice.size, 0);
});
