import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scene } from 'three';
import type { Drop } from './rain.ts';
import { RAIN, createRain, fallDrop, shownDrops } from './rain.ts';

void test('a drop falls, drifts with the wind and starts again above the hero when it lands', (): void => {
  const drop: Drop = { x: 0, y: 1, z: 0 };
  fallDrop(drop, 0.02, 0, 0, (): number => 0.5);
  assert.ok(drop.y < 1);
  assert.ok(drop.x > 0);
  fallDrop(drop, 0.1, 0, 0, (): number => 0.5);
  assert.ok(drop.y > 0 && drop.y <= RAIN.top);
  assert.ok(Math.abs(drop.x) <= RAIN.span / 2 && Math.abs(drop.z) <= RAIN.span / 2);
});

void test('drops stay in a box around the hero as the hero walks away', (): void => {
  const drop: Drop = { x: 0, y: 8, z: 0 };
  fallDrop(drop, 0.01, 100, -60, (): number => 0.5);
  assert.ok(Math.abs(drop.x - 100) <= RAIN.span / 2);
  assert.ok(Math.abs(drop.z + 60) <= RAIN.span / 2);
});

void test('rain density picks how many of the budgeted drops are drawn, and none hides the rain', (): void => {
  assert.equal(shownDrops(0.5, 1000), 500);
  assert.equal(shownDrops(2, 1000), 1000);
  assert.equal(shownDrops(-1, 1000), 0);
  const rain = createRain(new Scene(), 200, (): number => 0.25);
  rain.setDensity(0.5);
  assert.equal(rain.shown, 100);
  rain.update(0.016, 0, 0, 1);
  rain.setDensity(0);
  assert.equal(rain.shown, 0);
  rain.dispose();
});
