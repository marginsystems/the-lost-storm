import type { InstancedBufferGeometry, Scene } from 'three';
import { AdditiveBlending, DoubleSide, InstancedBufferAttribute, Mesh, NormalBlending, ShaderMaterial, Vector2, Vector3 } from 'three';
import type { RainBudget } from '../mobile/quality.ts';
import type { RainLayerDef, RainLayerUniforms, RainShared } from './rain.ts';
import { quadGeometry, RAIN, RAIN_LAYERS, seedAttribute, shownDrops } from './rain.ts';
import { MIST_FRAGMENT, MIST_VERTEX, RING_FRAGMENT, RING_VERTEX, SPRAY_VERTEX, STREAK_FRAGMENT } from './rain-shaders.ts';

export const RAIN_GROUND = {
  ringLife: 0.34,
  ringRadius: 0.12,
  ringThickness: 0.16,
  ringBright: 0.3,
  sprayGravity: 9.8,
  sprayKickMin: 0.35,
  sprayKickMax: 1.1,
  sprayRise: 1.25,
  sprayExposure: 0.02,
  sprayWidth: 0.008,
  sprayMinPixels: 1,
  sprayBright: 0.5,
  mistSpan: [40, 0.55, 40],
  mistLift: 0.12,
  mistSize: 5.5,
  mistDrift: 0.35,
  mistStrength: 0.16,
  mistFrom: 0.45,
  mistTo: 1,
  renderOrder: 2,
} as const;

export interface RainGround {
  setDensity(density: number): void;
  update(focusX: number, focusZ: number): void;
  dispose(): void;
}

export function splashLifeFits(): boolean {
  const longestLife: number = RAIN_GROUND.ringLife * 1.3;
  const sprayLife: number = (2 * RAIN_GROUND.sprayRise * 1.4) / RAIN_GROUND.sprayGravity;
  return RAIN_LAYERS.filter((def: RainLayerDef): boolean => def.name === 'mid').every((def: RainLayerDef): boolean => {
    const shortestCycle: number = def.span[1] / (def.speed * (1 + def.speedSpread));
    return Math.max(longestLife, sprayLife) < shortestCycle;
  });
}

export function mistStrength(density: number): number {
  const amount: number = Math.min(1, Math.max(0, (density - RAIN_GROUND.mistFrom) / (RAIN_GROUND.mistTo - RAIN_GROUND.mistFrom)));
  return RAIN_GROUND.mistStrength * amount * amount * (3 - 2 * amount);
}

export function splashCount(density: number, budget: RainBudget): number {
  return Math.min(shownDrops(density, budget.mid), budget.splashes);
}

function sprayGeometry(seeds: InstancedBufferAttribute, pieces: number): InstancedBufferGeometry {
  const total: number = Math.max(1, seeds.count * pieces);
  const copied: Float32Array = new Float32Array(total * 4);
  const piece: Float32Array = new Float32Array(total);
  for (let index: number = 0; index < total; index += 1) {
    const from: number = Math.floor(index / Math.max(1, pieces));
    for (let lane: number = 0; lane < 4; lane += 1) copied[index * 4 + lane] = seeds.array[from * 4 + lane] ?? 0;
    piece[index] = index % Math.max(1, pieces);
  }
  const geometry: InstancedBufferGeometry = quadGeometry(new InstancedBufferAttribute(copied, 4));
  geometry.setAttribute('aPiece', new InstancedBufferAttribute(piece, 1));
  return geometry;
}

function addMesh(scene: Scene, geometry: InstancedBufferGeometry, material: ShaderMaterial, order: number): Mesh {
  const mesh: Mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = order;
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}

export function createRainGround(scene: Scene, budget: RainBudget, shared: RainShared, mid: RainLayerUniforms, midSeeds: InstancedBufferAttribute, random: () => number = Math.random): RainGround {
  const ringGeometry: InstancedBufferGeometry = quadGeometry(midSeeds);
  const ringMaterial: ShaderMaterial = new ShaderMaterial({
    uniforms: { ...shared, ...mid, uLife: { value: RAIN_GROUND.ringLife }, uRadius: { value: RAIN_GROUND.ringRadius }, uThickness: { value: RAIN_GROUND.ringThickness }, uBright: { value: RAIN_GROUND.ringBright } },
    vertexShader: RING_VERTEX,
    fragmentShader: RING_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    fog: true,
  });
  const ring: Mesh = addMesh(scene, ringGeometry, ringMaterial, RAIN.renderOrder);

  const pieces: number = Math.max(0, budget.sprays);
  const sprayShape: InstancedBufferGeometry = sprayGeometry(midSeeds, Math.max(1, pieces));
  const sprayMaterial: ShaderMaterial = new ShaderMaterial({
    uniforms: {
      ...shared,
      ...mid,
      uGravity: { value: RAIN_GROUND.sprayGravity },
      uKick: { value: new Vector2(RAIN_GROUND.sprayKickMin, RAIN_GROUND.sprayKickMax) },
      uRise: { value: RAIN_GROUND.sprayRise },
      uExposure: { value: RAIN_GROUND.sprayExposure },
      uWidth: { value: RAIN_GROUND.sprayWidth },
      uMinPixels: { value: RAIN_GROUND.sprayMinPixels },
      uBright: { value: RAIN_GROUND.sprayBright },
    },
    vertexShader: SPRAY_VERTEX,
    fragmentShader: STREAK_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    fog: true,
  });
  const spray: Mesh = addMesh(scene, sprayShape, sprayMaterial, RAIN.renderOrder);

  const mistCentre: Vector3 = new Vector3();
  const mistStrengthUniform: { value: number } = { value: 0 };
  const mistGeometry: InstancedBufferGeometry = quadGeometry(seedAttribute(budget.mist, random));
  const mistMaterial: ShaderMaterial = new ShaderMaterial({
    uniforms: {
      ...shared,
      uCentre: { value: mistCentre },
      uSpan: { value: new Vector3(RAIN_GROUND.mistSpan[0], RAIN_GROUND.mistSpan[1], RAIN_GROUND.mistSpan[2]) },
      uSize: { value: RAIN_GROUND.mistSize },
      uDrift: { value: RAIN_GROUND.mistDrift },
      uStrength: mistStrengthUniform,
    },
    vertexShader: MIST_VERTEX,
    fragmentShader: MIST_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: NormalBlending,
    fog: true,
  });
  const mist: Mesh = addMesh(scene, mistGeometry, mistMaterial, RAIN_GROUND.renderOrder);

  return {
    setDensity(density: number): void {
      const splashes: number = splashCount(density, budget);
      ringGeometry.instanceCount = splashes;
      ring.visible = splashes > 0;
      sprayShape.instanceCount = pieces > 0 ? splashes * pieces : 0;
      spray.visible = pieces > 0 && splashes > 0;
      mistStrengthUniform.value = mistStrength(density);
      mistGeometry.instanceCount = mistStrengthUniform.value > 0 ? budget.mist : 0;
      mist.visible = mistGeometry.instanceCount > 0;
    },
    update(focusX: number, focusZ: number): void {
      mistCentre.set(focusX, RAIN_GROUND.mistLift, focusZ);
    },
    dispose(): void {
      for (const mesh of [ring, spray, mist]) scene.remove(mesh);
      for (const geometry of [ringGeometry, sprayShape, mistGeometry]) geometry.dispose();
      for (const material of [ringMaterial, sprayMaterial, mistMaterial]) material.dispose();
    },
  };
}
