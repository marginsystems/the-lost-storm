import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DeviceFacts, QualityTier } from './quality.ts';
import { chooseQuality, configureRenderBudget, createQuality, DEVICE_LIMITS, fittedSize, pixelRatioFor, QUALITY_TIERS, renderBudget, texturePath } from './quality.ts';

const DESKTOP: DeviceFacts = { search: '', coarsePointer: false, shortSide: 900, longSide: 1440, deviceMemory: 16, cores: 10 };

void test('a touch device or a small low memory machine gets the mobile tier', (): void => {
  assert.equal(chooseQuality(DESKTOP), 'desktop');
  assert.equal(chooseQuality({ ...DESKTOP, coarsePointer: true }), 'mobile');
  assert.equal(chooseQuality({ ...DESKTOP, deviceMemory: 2, cores: 4 }), 'mobile');
  assert.equal(chooseQuality({ ...DESKTOP, deviceMemory: 2, cores: 8 }), 'desktop');
  assert.equal(chooseQuality({ ...DESKTOP, deviceMemory: null, cores: null }), 'desktop');
});

void test('the query string forces a tier', (): void => {
  assert.equal(chooseQuality({ ...DESKTOP, search: '?quality=mobile' }), 'mobile');
  assert.equal(chooseQuality({ ...DESKTOP, coarsePointer: true, search: '?quality=desktop' }), 'desktop');
});

void test('the mobile tier is lighter than desktop in every budget', (): void => {
  const desktop: QualityTier = QUALITY_TIERS.desktop;
  const mobile: QualityTier = QUALITY_TIERS.mobile;
  assert.ok(mobile.maxPixelRatio < desktop.maxPixelRatio);
  assert.equal(mobile.bloom, false);
  assert.equal(mobile.shadows, false);
  assert.ok(mobile.zoneLights < desktop.zoneLights);
  assert.ok(mobile.particleCapacity < desktop.particleCapacity);
  assert.ok(mobile.mistLayers < desktop.mistLayers);
  assert.ok(mobile.maxTextureSize < desktop.maxTextureSize);
  assert.ok(mobile.maxModelTextureSize <= mobile.maxTextureSize);
});

void test('the pixel ratio is capped by the tier and by its pixel budget, never below the floor', (): void => {
  assert.equal(pixelRatioFor(QUALITY_TIERS.desktop, 3, 1920, 1080), QUALITY_TIERS.desktop.maxPixelRatio);
  assert.equal(pixelRatioFor(QUALITY_TIERS.desktop, 0, 1920, 1080), 1);
  const phone: number = pixelRatioFor(QUALITY_TIERS.mobile, 3, 844, 390);
  assert.ok(phone <= QUALITY_TIERS.mobile.maxPixelRatio);
  assert.ok(844 * 390 * phone * phone <= (QUALITY_TIERS.mobile.pixelBudget ?? 0));
  assert.equal(pixelRatioFor(QUALITY_TIERS.mobile, 3, 4000, 3000), DEVICE_LIMITS.minPixelRatio);
});

void test('a texture is fitted inside the size limit keeping its shape', (): void => {
  assert.deepEqual(fittedSize(1024, 512, 512), { width: 512, height: 256 });
  assert.deepEqual(fittedSize(256, 256, 512), { width: 256, height: 256 });
});

void test('a quality change reaches subscribers once and the render budget follows it', (): void => {
  const quality = createQuality('desktop');
  const seen: string[] = [];
  const stop = quality.subscribe((tier: QualityTier): void => {
    seen.push(tier.name);
  });
  quality.set('mobile');
  quality.set('mobile');
  stop();
  quality.set('desktop');
  assert.deepEqual(seen, ['mobile']);
  configureRenderBudget(QUALITY_TIERS.mobile);
  assert.equal(renderBudget().name, 'mobile');
  configureRenderBudget(QUALITY_TIERS.desktop);
});

void test('the half texture path swaps the folder only when asked and only for surface textures', (): void => {
  assert.equal(texturePath('textures/cobble_color.webp', true), 'textures/half/cobble_color.webp');
  assert.equal(texturePath('textures/cobble_color.webp', false), 'textures/cobble_color.webp');
  assert.equal(texturePath('textures/half/cobble_color.webp', true), 'textures/half/cobble_color.webp');
  assert.equal(texturePath('models/x.glb', true), 'models/x.glb');
});
