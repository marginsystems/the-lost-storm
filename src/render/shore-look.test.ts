import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ZoneAmbience } from '../../sim/content/types.ts';
import { blendAmbience, shoreEase } from './shore-look.ts';

const white: ZoneAmbience = { background: '#d9dcdf', abyss: '#d9dcdf', fogNear: 46, fogFar: 120, skyColor: '#eef1f4', groundColor: '#b9bec4', skyIntensity: 2.2, keyColor: '#f3f5f8', keyIntensity: 0.9 };
const night: ZoneAmbience = { background: '#06080d', abyss: '#040508', fogNear: 20, fogFar: 70, skyColor: '#4a5c7c', groundColor: '#100d0b', skyIntensity: 1.1, keyColor: '#9fb3d6', keyIntensity: 0.7 };

void test('the light is the mist at the shore line and the night storm out on the rock', (): void => {
  assert.deepEqual(blendAmbience(white, night, 0), white);
  assert.deepEqual(blendAmbience(white, night, 1), night);
});

void test('halfway onto the rock the light sits between the two', (): void => {
  const half: ZoneAmbience = blendAmbience(white, night, 0.5);
  assert.equal(half.fogFar, 95);
  assert.ok(half.skyIntensity > night.skyIntensity && half.skyIntensity < white.skyIntensity);
  assert.notEqual(half.background, white.background);
  assert.notEqual(half.background, night.background);
});

void test('walking onto the shore eases in and out rather than starting at full speed', (): void => {
  assert.equal(shoreEase(-1), 0);
  assert.equal(shoreEase(2), 1);
  assert.equal(shoreEase(0.5), 0.5);
  assert.ok(shoreEase(0.1) < 0.1);
});
