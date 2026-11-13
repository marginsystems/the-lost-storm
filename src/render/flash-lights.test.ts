import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color, Group } from 'three';
import { KIT } from './effect-kit.ts';
import { createFlashLights } from './flash-lights.ts';

void test('a flash rises from dark over its rise, peaks, then decays, and the pool never grows past its lights', (): void => {
  const parent: Group = new Group();
  const flashes = createFlashLights(parent, 2);
  assert.equal(parent.children.length, 2);
  const light = flashes.lights[0];
  assert.ok(light !== undefined);
  const level = (): number => light.intensity;
  flashes.flash(0, 2, 0, new Color(0x9be1ff), 40, 0.16);
  assert.equal(level(), 0);
  flashes.update(1 / 60);
  assert.ok(level() > 0 && level() < 20);
  flashes.update(0.16 - 1 / 60);
  assert.ok(level() > 39);
  flashes.update(0.5);
  assert.ok(level() < 1);
  for (let index: number = 0; index < 5; index += 1) flashes.flash(0, 2, 0, new Color(0xffffff), 10, KIT.flashRise);
  assert.equal(parent.children.length, 2);
  flashes.clear();
  assert.ok(flashes.lights.every((each): boolean => each.intensity === 0));
});
