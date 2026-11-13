import type { Light, Scene } from 'three';
import { DirectionalLight, HemisphereLight, PointLight, SpotLight } from 'three';
import { stepSpring } from './lobby-orbit.ts';
import type { Spring } from './lobby-orbit.ts';

export const LOBBY_LIGHTS = {
  sky: { color: 0x9fb4d8, ground: 0x07090c, intensity: 0.8 },
  key: { color: 0xffe0c4, intensity: 1.6, at: [-2.2, 3, 4] },
  rim: { color: 0x9cc0ff, intensity: 3.4, at: [2.4, 3.6, -3] },
  kicker: { color: 0x9cc0ff, intensity: 2.2, reach: 6, at: [1.2, 2.6, 0.6] },
  pool: { color: 0xf3e6d4, intensity: 3.2, at: [0.4, 6, 1.2], aim: [0, 0, 0.15], angle: 0.2, penumbra: 1 },
  aimHeight: 1.2,
  shadow: { size: 2048, radius: 5, bias: -0.0004, normalBias: 0.02, rimNormalBias: 0, left: -2, right: 2, top: 2, bottom: -1.8, near: 0.5, far: 12 },
  spring: { freq: 1.4, damping: 1 },
} as const;

export interface LobbyLights {
  step(dt: number): void;
  readonly share: number;
}

interface Lit {
  readonly light: Light;
  readonly full: number;
}

function shadowed(light: DirectionalLight, normalBias: number): DirectionalLight {
  const settings = LOBBY_LIGHTS.shadow;
  light.castShadow = true;
  light.shadow.mapSize.set(settings.size, settings.size);
  light.shadow.radius = settings.radius;
  light.shadow.bias = settings.bias;
  light.shadow.normalBias = normalBias;
  const view = light.shadow.camera;
  view.left = settings.left;
  view.right = settings.right;
  view.top = settings.top;
  view.bottom = settings.bottom;
  view.near = settings.near;
  view.far = settings.far;
  view.updateProjectionMatrix();
  return light;
}

export function createLobbyLights(scene: Scene): LobbyLights {
  const spec = LOBBY_LIGHTS;
  const sky: HemisphereLight = new HemisphereLight(spec.sky.color, spec.sky.ground, 0);
  const key: DirectionalLight = shadowed(new DirectionalLight(spec.key.color, 0), spec.shadow.normalBias);
  key.position.set(spec.key.at[0], spec.key.at[1], spec.key.at[2]);
  key.target.position.set(0, spec.aimHeight, 0);
  const rim: DirectionalLight = shadowed(new DirectionalLight(spec.rim.color, 0), spec.shadow.rimNormalBias);
  rim.position.set(spec.rim.at[0], spec.rim.at[1], spec.rim.at[2]);
  rim.target.position.set(0, spec.aimHeight, 0);
  const kicker: PointLight = new PointLight(spec.kicker.color, 0, spec.kicker.reach);
  kicker.position.set(spec.kicker.at[0], spec.kicker.at[1], spec.kicker.at[2]);
  const pool: SpotLight = new SpotLight(spec.pool.color, 0, 0, spec.pool.angle, spec.pool.penumbra, 0);
  pool.position.set(spec.pool.at[0], spec.pool.at[1], spec.pool.at[2]);
  pool.target.position.set(spec.pool.aim[0], spec.pool.aim[1], spec.pool.aim[2]);
  scene.add(sky, key, key.target, rim, rim.target, kicker, pool, pool.target);
  const lit: readonly Lit[] = [
    { light: sky, full: spec.sky.intensity },
    { light: key, full: spec.key.intensity },
    { light: rim, full: spec.rim.intensity },
    { light: kicker, full: spec.kicker.intensity },
    { light: pool, full: spec.pool.intensity },
  ];
  const share: Spring = { x: 0, v: 0 };
  return {
    step(dt: number): void {
      const amount: number = Math.min(1, Math.max(0, stepSpring(share, 1, spec.spring.freq, spec.spring.damping, dt)));
      for (const entry of lit) entry.light.intensity = entry.full * amount;
    },
    get share(): number {
      return share.x;
    },
  };
}
