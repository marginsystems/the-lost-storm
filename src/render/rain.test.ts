import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scene, Vector2, Vector3, Vector4 } from 'three';
import { QUALITY_TIERS } from '../mobile/quality.ts';
import type { RainLayerDef, RainView, Torch } from './rain.ts';
import { createRain, createRainShared, gust, layerCapacity, layerCentre, pickTorches, RAIN, RAIN_LAYERS, shownDrops, windAt } from './rain.ts';

function layer(name: RainLayerDef['name']): RainLayerDef {
  const found: RainLayerDef | undefined = RAIN_LAYERS.find((def: RainLayerDef): boolean => def.name === name);
  if (found === undefined) throw new Error(`no ${name} layer`);
  return found;
}

const VIEW: RainView = { eye: new Vector3(10, 21, 10), forward: new Vector3(-0.45, -0.77, -0.45).normalize(), focusX: -8, focusZ: -8 };

void test('rain density picks how many of the budgeted drops are drawn, and none hides the rain', (): void => {
  assert.equal(shownDrops(0.5, 1000), 500);
  assert.equal(shownDrops(2, 1000), 1000);
  assert.equal(shownDrops(-1, 1000), 0);
  const rain = createRain(new Scene(), QUALITY_TIERS.mobile.rain, createRainShared(), (): number => 0.25);
  rain.setDensity(0.5);
  const budget = QUALITY_TIERS.mobile.rain;
  assert.equal(rain.shown, shownDrops(0.5, budget.near) + shownDrops(0.5, budget.mid) + shownDrops(0.5, budget.far));
  rain.update(VIEW);
  rain.setDensity(0);
  assert.equal(rain.shown, 0);
  rain.dispose();
});

void test('each depth layer draws from its own budget', (): void => {
  const budget = QUALITY_TIERS.desktop.rain;
  assert.equal(layerCapacity(budget, 'near'), budget.near);
  assert.equal(layerCapacity(budget, 'mid'), budget.mid);
  assert.equal(layerCapacity(budget, 'far'), budget.far);
});

void test('near drops are few, large and soft, mid drops are the dense fine body, far drops a faint haze', (): void => {
  const near: RainLayerDef = layer('near');
  const mid: RainLayerDef = layer('mid');
  const far: RainLayerDef = layer('far');
  assert.ok(near.width > mid.width && mid.width >= far.width);
  assert.ok(far.bright < mid.bright && near.bright < mid.bright);
  for (const tier of [QUALITY_TIERS.desktop, QUALITY_TIERS.mobile]) assert.ok(tier.rain.near < tier.rain.mid);
  for (const def of RAIN_LAYERS) assert.ok(def.speed * def.exposure < 0.5, `${def.name} streaks stay short`);
});

void test('the near layer sits in front of the camera and the mid layer stands on the ground around the hero', (): void => {
  const near: Vector3 = layerCentre(layer('near'), VIEW, new Vector3());
  assert.ok(near.distanceTo(VIEW.eye) > 1 && near.distanceTo(VIEW.eye) < layer('near').forward + 0.01);
  const mid: Vector3 = layerCentre(layer('mid'), VIEW, new Vector3());
  assert.equal(mid.x, VIEW.focusX);
  assert.equal(mid.z, VIEW.focusZ);
  assert.equal(mid.y - layer('mid').span[1] / 2, 0);
  const far: Vector3 = layerCentre(layer('far'), VIEW, new Vector3());
  assert.ok(far.x < VIEW.focusX && far.z < VIEW.focusZ);
});

void test('gusts sway the wind slowly around one direction and never reverse it', (): void => {
  const wind: Vector2 = new Vector2();
  const base: Vector2 = new Vector2(RAIN.windX, RAIN.windZ).normalize();
  let strongest: number = 0;
  let weakest: number = Number.POSITIVE_INFINITY;
  for (let time: number = 0; time < 120; time += 0.25) {
    windAt(time, wind);
    assert.ok(Math.abs(gust(time)) <= 1);
    assert.ok(wind.clone().normalize().dot(base) > Math.cos(RAIN.gustSway + 1e-6));
    strongest = Math.max(strongest, wind.length());
    weakest = Math.min(weakest, wind.length());
    const later: Vector2 = windAt(time + 0.05, new Vector2());
    assert.ok(later.distanceTo(wind) < 0.2, 'the wind changes smoothly');
  }
  assert.ok(weakest > 0);
  assert.ok(strongest - weakest > RAIN.windSpeed * 0.4);
});

void test('the nearest fires within reach light the rain and empty slots stay dark', (): void => {
  const torches: Torch[] = [
    { x: 30, y: 1, z: 0 },
    { x: 2, y: 1.5, z: 0 },
    { x: 5, y: 1.2, z: 0 },
    { x: 2, y: 1.5, z: 0 },
  ];
  const slots: Vector4[] = [new Vector4(), new Vector4(), new Vector4(), new Vector4()];
  pickTorches(torches, 0, 0, 10, slots);
  assert.deepEqual(slots.map((slot: Vector4): number => slot.x), [2, 2, 5, 0]);
  assert.deepEqual(slots.map((slot: Vector4): number => slot.w), [1, 1, 1, 0]);
});
