import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DirectionalLight, Scene } from 'three';
import type { Light, Object3D } from 'three';
import { createLobbyLights, LOBBY_LIGHTS } from './lobby-lights.ts';
import type { LobbyLights } from './lobby-lights.ts';

const FRAME: number = 1 / 60;

function lightsOf(scene: Scene): Light[] {
  return scene.children.filter((child: Object3D): child is Light => 'isLight' in child && child.isLight === true);
}

void test('the lobby lights start dark and spring up to full without overshoot or a jump', (): void => {
  const scene: Scene = new Scene();
  const lights: LobbyLights = createLobbyLights(scene);
  const all: Light[] = lightsOf(scene);
  assert.equal(all.length, 5);
  for (const light of all) assert.equal(light.intensity, 0);
  let previous: number = 0;
  let biggestStep: number = 0;
  for (let frame: number = 0; frame < 360; frame += 1) {
    lights.step(FRAME);
    assert.ok(lights.share <= 1 + 1e-6, `share ${lights.share}`);
    biggestStep = Math.max(biggestStep, lights.share - previous);
    previous = lights.share;
  }
  assert.ok(lights.share > 0.999, `share settled at ${lights.share}`);
  assert.ok(biggestStep < ((2 * Math.PI * LOBBY_LIGHTS.spring.freq) / Math.E) * FRAME * 1.05, `the light rose ${biggestStep.toFixed(3)} in one frame`);
  const key: Light | undefined = all.find((light: Light): boolean => light instanceof DirectionalLight && light.castShadow && Math.abs(light.intensity - LOBBY_LIGHTS.key.intensity) < 1e-3);
  assert.ok(key !== undefined, 'the warm key is at full strength and casts a shadow');
});

