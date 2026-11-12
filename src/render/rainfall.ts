import type { Vector4 } from 'three';
import { Fog, Vector2, Vector3 } from 'three';
import type { ZoneWeather } from '../../sim/content/road-types.ts';
import type { Quality, QualityTier } from '../mobile/quality.ts';
import type { Settings } from '../settings/settings.ts';
import type { LensPass, LensState } from './lens-water.ts';
import { anyLensDrop, clearLens, createLensPass, createLensState, kickLens, LENS, lensActive, stepLens } from './lens-water.ts';
import type { Rain, RainShared, Torch } from './rain.ts';
import { createRain, createRainShared, gust, pickTorches, RAIN, windAt } from './rain.ts';
import type { RainGround } from './rain-ground.ts';
import { createRainGround } from './rain-ground.ts';
import type { Stage } from './stage.ts';

export const RAINFALL = {
  flashKickAt: 0.55,
  gustKickAt: 0.82,
  torchRefresh: 2,
  reducedMotion: '(prefers-reduced-motion: reduce)',
} as const;

export interface LightSources {
  readonly torches: readonly Torch[];
  readonly lightsVersion: number;
}

export interface LensSettings {
  get(): Settings;
  subscribe(listener: (settings: Settings) => void): void;
}

export interface Rainfall {
  setWeather(weather: ZoneWeather): void;
  update(dt: number, focusX: number, focusZ: number, flash: number, lights: LightSources): void;
}

export interface RainEdges {
  flash: number;
  gust: number;
}

export function rainKicks(edges: RainEdges, flash: number, gustNow: number): number {
  let kick: number = 0;
  if (flash >= RAINFALL.flashKickAt && edges.flash < RAINFALL.flashKickAt) kick += LENS.flashKick;
  if (gustNow >= RAINFALL.gustKickAt && edges.gust < RAINFALL.gustKickAt) kick += LENS.gustKick;
  edges.flash = flash;
  edges.gust = gustNow;
  return kick;
}

function reducedMotionQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(RAINFALL.reducedMotion) : null;
}

export function createRainfall(stage: Stage, quality: Quality, settings: LensSettings, random: () => number = Math.random): Rainfall {
  const shared: RainShared = createRainShared();
  let tier: QualityTier = quality.tier;
  let rain: Rain = createRain(stage.scene, tier.rain, shared, random);
  let ground: RainGround = createRainGround(stage.scene, tier.rain, shared, rain.mid, rain.midSeeds, random);
  const lensPass: LensPass = createLensPass();
  const lens: LensState = createLensState();
  const edges: RainEdges = { flash: 0, gust: 0 };
  const view: { eye: Vector3; forward: Vector3; focusX: number; focusZ: number } = { eye: new Vector3(), forward: new Vector3(), focusX: 0, focusZ: 0 };
  const size: Vector2 = new Vector2();
  const torchesLit: boolean[] = shared.uTorches.value.map((): boolean => false);
  const motion: MediaQueryList | null = reducedMotionQuery();
  let reducedMotion: boolean = motion?.matches ?? false;
  let lensSetting: boolean = settings.get().graphics.lensWater;
  let lensOn: boolean = false;
  let weather: ZoneWeather | null = null;
  let time: number = 0;
  let torchVersion: number = -1;
  let torchSource: LightSources | null = null;
  let torchX: number = Number.POSITIVE_INFINITY;
  let torchZ: number = Number.POSITIVE_INFINITY;

  const density = (): number => weather?.rain ?? 0;

  const refreshLens = (): void => {
    const wanted: boolean = lensActive({ tier: tier.rain.lens, setting: lensSetting, reducedMotion, rain: density() });
    if (wanted === lensOn) return;
    lensOn = wanted;
    if (!wanted) clearLens(lens);
    lensPass.pass.enabled = false;
    stage.setFinish(wanted ? lensPass.pass : null);
  };

  const applyDensity = (): void => {
    rain.setDensity(density());
    ground.setDensity(density());
    refreshLens();
  };

  motion?.addEventListener('change', (event: MediaQueryListEvent): void => {
    reducedMotion = event.matches;
    refreshLens();
  });

  settings.subscribe((next: Settings): void => {
    lensSetting = next.graphics.lensWater;
    refreshLens();
  });

  quality.subscribe((next: QualityTier): void => {
    tier = next;
    ground.dispose();
    rain.dispose();
    rain = createRain(stage.scene, tier.rain, shared, random);
    ground = createRainGround(stage.scene, tier.rain, shared, rain.mid, rain.midSeeds, random);
    applyDensity();
  });

  const refreshTorches = (lights: LightSources, focusX: number, focusZ: number): void => {
    const moved: boolean = Math.hypot(focusX - torchX, focusZ - torchZ) > RAINFALL.torchRefresh;
    if (lights === torchSource && lights.lightsVersion === torchVersion && !moved) return;
    torchSource = lights;
    torchVersion = lights.lightsVersion;
    torchX = focusX;
    torchZ = focusZ;
    pickTorches(lights.torches, focusX, focusZ, RAIN.torchReach * 2, shared.uTorches.value);
    for (let index: number = 0; index < torchesLit.length; index += 1) torchesLit[index] = (shared.uTorches.value[index]?.w ?? 0) > 0;
  };

  const flicker = (): void => {
    for (let index: number = 0; index < shared.uTorches.value.length; index += 1) {
      const slot: Vector4 | undefined = shared.uTorches.value[index];
      if (slot === undefined) continue;
      slot.w = torchesLit[index] === true ? 1 + RAIN.torchFlicker * Math.sin(time * RAIN.torchFlickerRate + index * 1.7) : 0;
    }
  };

  return {
    setWeather(next: ZoneWeather): void {
      weather = next;
      applyDensity();
    },
    update(dt: number, focusX: number, focusZ: number, flash: number, lights: LightSources): void {
      time = (time + dt) % RAIN.timeWrap;
      const strength: number = density();
      if (strength <= 0) return;
      shared.uTime.value = time;
      windAt(time, shared.uWind.value);
      shared.uFlash.value = Math.min(1, Math.max(0, flash));
      const fog: unknown = stage.scene.fog;
      if (fog instanceof Fog) {
        shared.fogNear.value = fog.near;
        shared.fogFar.value = fog.far;
        shared.fogColor.value.copy(fog.color);
      }
      stage.renderer.getDrawingBufferSize(shared.uResolution.value);
      stage.camera.getWorldPosition(view.eye);
      stage.camera.getWorldDirection(view.forward);
      view.focusX = focusX;
      view.focusZ = focusZ;
      rain.update(view);
      ground.update(focusX, focusZ);
      shared.uHero.value.set(focusX, RAIN.heroHeight, focusZ);
      refreshTorches(lights, focusX, focusZ);
      flicker();
      const kick: number = rainKicks(edges, flash, gust(time));
      if (!lensOn) return;
      if (kick > 0) kickLens(lens, kick);
      stepLens(lens, dt, strength, random);
      stage.renderer.getSize(size);
      lensPass.update(lens, size.y > 0 ? size.x / size.y : 1, flash);
      lensPass.pass.enabled = anyLensDrop(lens);
    },
  };
}
