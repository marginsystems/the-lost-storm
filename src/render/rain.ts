import type { IUniform, Scene } from 'three';
import { AdditiveBlending, DoubleSide, BufferAttribute, Color, LinearSRGBColorSpace, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, ShaderMaterial, Vector2, Vector3, Vector4 } from 'three';
import type { RainBudget } from '../mobile/quality.ts';
import { RAIN_LIGHTS, STREAK_FRAGMENT, STREAK_VERTEX } from './rain-shaders.ts';

export const RAIN = {
  windX: 0.85,
  windZ: 0.53,
  windSpeed: 3.1,
  gustStrength: 0.5,
  gustSway: 0.09,
  gustRates: [0.13, 0.31, 0.71],
  gustWeights: [0.55, 0.3, 0.15],
  gustPhases: [0.9, 2.3, 4.1],
  swayRate: 0.07,
  base: [0.13, 0.155, 0.2],
  flashColor: 0xb8cdf0,
  flashScale: 2.6,
  torchColor: 0xff8a3a,
  torchScale: 1.9,
  torchReach: 10,
  torchFlicker: 0.12,
  torchFlickerRate: 9.3,
  heroColor: 0x6a7d99,
  heroScale: 0.5,
  heroReach: 7,
  heroHeight: 4.2,
  fadeNear: 16,
  fadeFar: 44,
  renderOrder: 3,
} as const;

export type RainLayerName = 'near' | 'mid' | 'far';

export interface RainLayerDef {
  readonly name: RainLayerName;
  readonly span: readonly [number, number, number];
  readonly forward: number;
  readonly speed: number;
  readonly speedSpread: number;
  readonly slant: number;
  readonly exposure: number;
  readonly lengthSpread: number;
  readonly width: number;
  readonly minPixels: number;
  readonly bright: number;
}

export const RAIN_LAYERS: readonly RainLayerDef[] = [
  { name: 'near', span: [7, 7, 7], forward: 6.5, speed: 15, speedSpread: 0.15, slant: 0.18, exposure: 0.03, lengthSpread: 0.3, width: 0.022, minPixels: 1, bright: 0.28 },
  { name: 'mid', span: [46, 14, 46], forward: 0, speed: 17, speedSpread: 0.22, slant: 0.22, exposure: 0.028, lengthSpread: 0.35, width: 0.006, minPixels: 1, bright: 0.9 },
  { name: 'far', span: [96, 24, 96], forward: 18, speed: 18, speedSpread: 0.2, slant: 0.2, exposure: 0.026, lengthSpread: 0.3, width: 0.005, minPixels: 1, bright: 0.45 },
];

export interface RainShared {
  readonly uTime: IUniform<number>;
  readonly uWind: IUniform<Vector2>;
  readonly uResolution: IUniform<Vector2>;
  readonly uBase: IUniform<Color>;
  readonly uFlashColor: IUniform<Color>;
  readonly uFlash: IUniform<number>;
  readonly uTorches: IUniform<Vector4[]>;
  readonly uTorchColor: IUniform<Color>;
  readonly uTorchReach: IUniform<number>;
  readonly uHero: IUniform<Vector3>;
  readonly uHeroColor: IUniform<Color>;
  readonly uHeroReach: IUniform<number>;
  readonly uFadeNear: IUniform<number>;
  readonly uFadeFar: IUniform<number>;
  readonly fogNear: IUniform<number>;
  readonly fogFar: IUniform<number>;
  readonly fogColor: IUniform<Color>;
}

export interface RainLayerUniforms {
  readonly uCentre: IUniform<Vector3>;
  readonly uSpan: IUniform<Vector3>;
  readonly uSpeed: IUniform<number>;
  readonly uSpeedSpread: IUniform<number>;
  readonly uSlant: IUniform<number>;
}

export interface RainView {
  readonly eye: Vector3;
  readonly forward: Vector3;
  readonly focusX: number;
  readonly focusZ: number;
}

export interface Torch {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Rain {
  readonly shared: RainShared;
  readonly mid: RainLayerUniforms;
  readonly midSeeds: InstancedBufferAttribute;
  readonly shown: number;
  setDensity(density: number): void;
  update(view: RainView): void;
  dispose(): void;
}

export function shownDrops(density: number, capacity: number): number {
  return Math.round(Math.min(1, Math.max(0, density)) * capacity);
}

export function layerCapacity(budget: RainBudget, name: RainLayerName): number {
  return budget[name];
}

export function gust(time: number): number {
  let total: number = 0;
  for (let index: number = 0; index < RAIN.gustRates.length; index += 1) {
    const rate: number = RAIN.gustRates[index] ?? 0;
    const weight: number = RAIN.gustWeights[index] ?? 0;
    const phase: number = RAIN.gustPhases[index] ?? 0;
    total += weight * Math.sin(time * rate * Math.PI * 2 + phase);
  }
  return total;
}

export function windAt(time: number, out: Vector2): Vector2 {
  const strength: number = RAIN.windSpeed * (1 + RAIN.gustStrength * gust(time));
  const sway: number = RAIN.gustSway * Math.sin(time * RAIN.swayRate * Math.PI * 2);
  const length: number = Math.hypot(RAIN.windX, RAIN.windZ);
  const cos: number = Math.cos(sway);
  const sin: number = Math.sin(sway);
  const x: number = RAIN.windX / length;
  const z: number = RAIN.windZ / length;
  return out.set((x * cos - z * sin) * strength, (x * sin + z * cos) * strength);
}

export function layerCentre(def: RainLayerDef, view: RainView, out: Vector3): Vector3 {
  if (def.name === 'near') return out.copy(view.forward).multiplyScalar(def.forward).add(view.eye);
  const flat: number = Math.hypot(view.forward.x, view.forward.z);
  const along: number = flat > 0 ? def.forward / flat : 0;
  return out.set(view.focusX + view.forward.x * along, def.span[1] / 2, view.focusZ + view.forward.z * along);
}

export function pickTorches(torches: readonly Torch[], focusX: number, focusZ: number, reach: number, out: readonly Vector4[]): void {
  let previous: number = -1;
  let previousDistance: number = -1;
  for (const slot of out) {
    let best: number = -1;
    let bestDistance: number = reach * reach;
    for (let index: number = 0; index < torches.length; index += 1) {
      const torch: Torch | undefined = torches[index];
      if (torch === undefined) continue;
      const distance: number = (torch.x - focusX) ** 2 + (torch.z - focusZ) ** 2;
      const later: boolean = distance > previousDistance || (distance === previousDistance && index > previous);
      if (later && distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    const torch: Torch | undefined = torches[best];
    if (torch === undefined) {
      slot.set(0, 0, 0, 0);
      continue;
    }
    previous = best;
    previousDistance = bestDistance;
    slot.set(torch.x, torch.y, torch.z, 1);
  }
}

export function createRainShared(): RainShared {
  return {
    uTime: { value: 0 },
    uWind: { value: new Vector2() },
    uResolution: { value: new Vector2(1, 1) },
    uBase: { value: new Color().setRGB(RAIN.base[0], RAIN.base[1], RAIN.base[2], LinearSRGBColorSpace) },
    uFlashColor: { value: new Color(RAIN.flashColor).multiplyScalar(RAIN.flashScale) },
    uFlash: { value: 0 },
    uTorches: { value: Array.from({ length: RAIN_LIGHTS.torches }, (): Vector4 => new Vector4()) },
    uTorchColor: { value: new Color(RAIN.torchColor).multiplyScalar(RAIN.torchScale) },
    uTorchReach: { value: RAIN.torchReach },
    uHero: { value: new Vector3() },
    uHeroColor: { value: new Color(RAIN.heroColor).multiplyScalar(RAIN.heroScale) },
    uHeroReach: { value: RAIN.heroReach },
    uFadeNear: { value: RAIN.fadeNear },
    uFadeFar: { value: RAIN.fadeFar },
    fogNear: { value: 1 },
    fogFar: { value: 2 },
    fogColor: { value: new Color() },
  };
}

export function quadGeometry(seeds: InstancedBufferAttribute): InstancedBufferGeometry {
  const geometry: InstancedBufferGeometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(12), 3));
  geometry.setAttribute('aCorner', new BufferAttribute(new Float32Array([-1, 0, 1, 0, -1, 1, 1, 1]), 2));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  geometry.setAttribute('aSeed', seeds);
  geometry.instanceCount = 0;
  return geometry;
}

export function seedAttribute(count: number, random: () => number): InstancedBufferAttribute {
  const values: Float32Array = new Float32Array(Math.max(1, count) * 4);
  for (let index: number = 0; index < values.length; index += 1) values[index] = random();
  return new InstancedBufferAttribute(values, 4);
}

function layerUniforms(def: RainLayerDef): RainLayerUniforms {
  return {
    uCentre: { value: new Vector3() },
    uSpan: { value: new Vector3(def.span[0], def.span[1], def.span[2]) },
    uSpeed: { value: def.speed },
    uSpeedSpread: { value: def.speedSpread },
    uSlant: { value: def.slant },
  };
}

interface Layer {
  readonly def: RainLayerDef;
  readonly uniforms: RainLayerUniforms;
  readonly seeds: InstancedBufferAttribute;
  readonly geometry: InstancedBufferGeometry;
  readonly material: ShaderMaterial;
  readonly mesh: Mesh;
  readonly capacity: number;
}

function createLayer(scene: Scene, shared: RainShared, def: RainLayerDef, capacity: number, random: () => number): Layer {
  const uniforms: RainLayerUniforms = layerUniforms(def);
  const seeds: InstancedBufferAttribute = seedAttribute(capacity, random);
  const geometry: InstancedBufferGeometry = quadGeometry(seeds);
  const material: ShaderMaterial = new ShaderMaterial({
    uniforms: { ...shared, ...uniforms, uExposure: { value: def.exposure }, uLengthSpread: { value: def.lengthSpread }, uWidth: { value: def.width }, uMinPixels: { value: def.minPixels }, uBright: { value: def.bright } },
    vertexShader: STREAK_VERTEX,
    fragmentShader: STREAK_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    fog: true,
  });
  const mesh: Mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = RAIN.renderOrder;
  mesh.visible = false;
  scene.add(mesh);
  return { def, uniforms, seeds, geometry, material, mesh, capacity };
}

export function createRain(scene: Scene, budget: RainBudget, shared: RainShared, random: () => number = Math.random): Rain {
  const layers: Layer[] = RAIN_LAYERS.map((def: RainLayerDef): Layer => createLayer(scene, shared, def, layerCapacity(budget, def.name), random));
  const midLayer: Layer | undefined = layers.find((layer: Layer): boolean => layer.def.name === 'mid');
  if (midLayer === undefined) throw new Error('Rain has no mid layer');
  let shown: number = 0;

  return {
    shared,
    mid: midLayer.uniforms,
    midSeeds: midLayer.seeds,
    get shown(): number {
      return shown;
    },
    setDensity(density: number): void {
      shown = 0;
      for (const layer of layers) {
        const count: number = shownDrops(density, layer.capacity);
        layer.geometry.instanceCount = count;
        layer.mesh.visible = count > 0;
        shown += count;
      }
    },
    update(view: RainView): void {
      for (const layer of layers) layerCentre(layer.def, view, layer.uniforms.uCentre.value);
    },
    dispose(): void {
      for (const layer of layers) {
        scene.remove(layer.mesh);
        layer.geometry.dispose();
        layer.material.dispose();
      }
    },
  };
}
