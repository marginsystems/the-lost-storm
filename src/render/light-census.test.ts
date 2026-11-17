import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DirectionalLight, Group, PointLight, Scene, SpotLight } from 'three';
import { lightCensus } from './light-census.ts';

void test('the census counts the lights a render would use: shown ones, by kind, wherever they hang in the scene', (): void => {
  const scene: Scene = new Scene();
  const lamps: Group = new Group();
  lamps.add(new PointLight(), new PointLight());
  scene.add(lamps, new DirectionalLight());
  assert.equal(lightCensus(scene), 'DirectionalLight:1,PointLight:2');
  const again: Scene = new Scene();
  again.add(new DirectionalLight(), new PointLight(), new PointLight());
  assert.equal(lightCensus(again), lightCensus(scene));
});

void test('a hidden light, or one under a hidden parent, leaves the census, and a dark one stays', (): void => {
  const scene: Scene = new Scene();
  const lamps: Group = new Group();
  const lamp: PointLight = new PointLight(0xffffff, 0);
  const wake: SpotLight = new SpotLight();
  lamps.add(lamp);
  scene.add(lamps, wake);
  const all: string = lightCensus(scene);
  assert.equal(all, 'PointLight:1,SpotLight:1');
  wake.visible = false;
  assert.equal(lightCensus(scene), 'PointLight:1');
  lamps.visible = false;
  assert.equal(lightCensus(scene), '');
});

void test('a light that starts casting a shadow changes the census, because shaders are built per shadow count', (): void => {
  const scene: Scene = new Scene();
  const sun: DirectionalLight = new DirectionalLight();
  scene.add(sun);
  const plain: string = lightCensus(scene);
  sun.castShadow = true;
  assert.notEqual(lightCensus(scene), plain);
});
