import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scene } from 'three';
import { QUALITY_TIERS } from '../mobile/quality.ts';
import { createRain, createRainShared } from './rain.ts';
import { createRainGround, mistStrength, RAIN_GROUND, splashCount, splashLifeFits } from './rain-ground.ts';

void test('a splash ring and its spray are gone before the same drop lands again', (): void => {
  assert.ok(splashLifeFits());
});

void test('splashes follow the rain and stop at the tier cap', (): void => {
  const desktop = QUALITY_TIERS.desktop.rain;
  assert.equal(splashCount(0, desktop), 0);
  assert.equal(splashCount(1, desktop), desktop.splashes);
  assert.ok(splashCount(0.05, desktop) <= Math.round(desktop.mid * 0.05));
  assert.ok(QUALITY_TIERS.mobile.rain.splashes < desktop.splashes);
});

void test('low mist rises only in heavy rain and stays faint', (): void => {
  assert.equal(mistStrength(0), 0);
  assert.equal(mistStrength(RAIN_GROUND.mistFrom), 0);
  assert.ok(mistStrength(0.85) > 0);
  assert.ok(mistStrength(0.85) < mistStrength(1));
  assert.ok(mistStrength(2) <= RAIN_GROUND.mistStrength);
});

void test('the ground pieces build, follow the hero and come apart cleanly', (): void => {
  const scene: Scene = new Scene();
  const shared = createRainShared();
  const rain = createRain(scene, QUALITY_TIERS.mobile.rain, shared, (): number => 0.5);
  const before: number = scene.children.length;
  const ground = createRainGround(scene, QUALITY_TIERS.mobile.rain, shared, rain.mid, rain.midSeeds, (): number => 0.5);
  assert.equal(scene.children.length, before + 3);
  ground.setDensity(0.9);
  ground.update(4, 5);
  ground.setDensity(0);
  ground.dispose();
  rain.dispose();
  assert.equal(scene.children.length, 0);
});
