import type { IUniform } from 'three';
import { ShaderMaterial, Vector4 } from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const LENS = {
  drops: 8,
  rate: 0.07,
  boostRate: 0.55,
  boostDecay: 0.4,
  flashKick: 1,
  gustKick: 0.45,
  minSize: 0.011,
  maxSize: 0.024,
  minX: 0.05,
  maxX: 0.95,
  minY: 0.2,
  maxY: 0.95,
  form: 0.9,
  fade: 1.6,
  minLife: 5,
  maxLife: 11,
  runChance: 0.5,
  minRunAt: 1.4,
  maxRunAt: 4,
  runAccel: 0.012,
  runMax: 0.07,
  runStretch: 1.9,
  stretchSpeed: 0.05,
  refract: 0.55,
  glint: 0.07,
  flashGlint: 0.5,
  lift: 0.05,
} as const;

export interface LensDrop {
  alive: boolean;
  x: number;
  y: number;
  size: number;
  age: number;
  life: number;
  runAt: number;
  speed: number;
}

export interface LensState {
  readonly drops: readonly LensDrop[];
  pending: number;
  boost: number;
}

export interface LensWanted {
  readonly tier: boolean;
  readonly setting: boolean;
  readonly reducedMotion: boolean;
  readonly rain: number;
}

export function lensActive(wanted: LensWanted): boolean {
  return wanted.tier && wanted.setting && !wanted.reducedMotion && wanted.rain > 0;
}

export function createLensState(): LensState {
  return {
    drops: Array.from({ length: LENS.drops }, (): LensDrop => ({ alive: false, x: 0, y: 0, size: 0, age: 0, life: 0, runAt: 0, speed: 0 })),
    pending: 0,
    boost: 0,
  };
}

function between(random: () => number, low: number, high: number): number {
  return low + (high - low) * random();
}

function spawn(state: LensState, random: () => number): void {
  const drop: LensDrop | undefined = state.drops.find((candidate: LensDrop): boolean => !candidate.alive);
  if (drop === undefined) return;
  drop.alive = true;
  drop.x = between(random, LENS.minX, LENS.maxX);
  drop.y = between(random, LENS.minY, LENS.maxY);
  drop.size = between(random, LENS.minSize, LENS.maxSize);
  drop.age = 0;
  drop.life = between(random, LENS.minLife, LENS.maxLife);
  drop.runAt = random() < LENS.runChance ? between(random, LENS.minRunAt, LENS.maxRunAt) : Number.POSITIVE_INFINITY;
  drop.speed = 0;
}

export function kickLens(state: LensState, amount: number): void {
  state.boost = Math.min(1, state.boost + amount);
  state.pending += amount;
}

export function clearLens(state: LensState): void {
  for (const drop of state.drops) drop.alive = false;
  state.pending = 0;
  state.boost = 0;
}

export function stepLens(state: LensState, dt: number, rain: number, random: () => number): void {
  const wet: number = Math.min(1, Math.max(0, rain));
  state.pending += dt * wet * (LENS.rate + LENS.boostRate * state.boost);
  state.boost = Math.max(0, state.boost - LENS.boostDecay * dt);
  while (state.pending >= 1) {
    state.pending -= 1;
    if (wet > 0) spawn(state, random);
  }
  for (const drop of state.drops) {
    if (!drop.alive) continue;
    drop.age += dt;
    if (drop.age >= drop.runAt) {
      drop.speed = Math.min(LENS.runMax, drop.speed + LENS.runAccel * dt);
      drop.y -= drop.speed * dt;
    }
    if (drop.age >= drop.life || drop.y < -drop.size * LENS.runStretch) drop.alive = false;
  }
}

export function lensAlpha(drop: LensDrop): number {
  if (!drop.alive) return 0;
  const forming: number = Math.min(1, drop.age / LENS.form);
  const fading: number = Math.min(1, Math.max(0, (drop.life - drop.age) / LENS.fade));
  return forming * fading;
}

export function lensSize(drop: LensDrop): number {
  const forming: number = Math.min(1, drop.age / LENS.form);
  return drop.size * (0.35 + 0.65 * Math.sqrt(forming));
}

export function lensStretch(drop: LensDrop): number {
  return 1 + (LENS.runStretch - 1) * Math.min(1, drop.speed / LENS.stretchSpeed);
}

export function anyLensDrop(state: LensState): boolean {
  return state.drops.some((drop: LensDrop): boolean => drop.alive);
}

const LENS_VERTEX: string = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const LENS_FRAGMENT: string = `
#define DROPS ${LENS.drops}
uniform sampler2D tDiffuse;
uniform vec4 uDrops[DROPS];
uniform float uStretch[DROPS];
uniform float uAspect;
uniform float uRefract;
uniform float uGlint;
uniform float uLift;
varying vec2 vUv;

void main() {
  vec2 offset = vec2(0.0);
  float glint = 0.0;
  float wet = 0.0;
  vec3 light = normalize(vec3(-0.45, 0.55, 0.7));
  for (int index = 0; index < DROPS; index++) {
    vec4 drop = uDrops[index];
    if (drop.w <= 0.0) continue;
    vec2 p = (vUv - drop.xy) * vec2(uAspect, 1.0);
    if (p.y > 0.0) p.y /= uStretch[index];
    float q = length(p) / drop.z;
    if (q >= 1.0) continue;
    float edge = (1.0 - smoothstep(0.6, 1.0, q)) * drop.w;
    vec2 n = p / drop.z;
    float h = sqrt(max(0.0, 1.0 - q * q));
    offset -= n * drop.z * uRefract * edge;
    glint += pow(max(0.0, dot(normalize(vec3(n, h)), light)), 36.0) * edge;
    wet = max(wet, edge);
  }
  vec4 scene = texture2D(tDiffuse, vUv + offset / vec2(uAspect, 1.0));
  vec3 colour = scene.rgb * (1.0 + uLift * wet) + vec3(glint * uGlint);
  gl_FragColor = vec4(colour, scene.a);
}
`;

export interface LensPass {
  readonly pass: ShaderPass;
  update(state: LensState, aspect: number, flash: number): void;
  dispose(): void;
}

export function createLensPass(): LensPass {
  const drops: Vector4[] = Array.from({ length: LENS.drops }, (): Vector4 => new Vector4());
  const stretch: number[] = Array.from({ length: LENS.drops }, (): number => 1);
  const aspect: IUniform<number> = { value: 1 };
  const glint: IUniform<number> = { value: LENS.glint };
  const material: ShaderMaterial = new ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      uDrops: { value: drops },
      uStretch: { value: stretch },
      uAspect: aspect,
      uRefract: { value: LENS.refract },
      uGlint: glint,
      uLift: { value: LENS.lift },
    },
    vertexShader: LENS_VERTEX,
    fragmentShader: LENS_FRAGMENT,
  });
  const pass: ShaderPass = new ShaderPass(material);
  return {
    pass,
    update(state: LensState, ratio: number, flash: number): void {
      aspect.value = ratio;
      glint.value = LENS.glint + LENS.flashGlint * Math.min(1, Math.max(0, flash));
      for (let index: number = 0; index < state.drops.length; index += 1) {
        const drop: LensDrop | undefined = state.drops[index];
        if (drop === undefined) continue;
        drops[index]?.set(drop.x, drop.y, lensSize(drop), lensAlpha(drop));
        stretch[index] = lensStretch(drop);
      }
    },
    dispose(): void {
      pass.dispose();
      material.dispose();
    },
  };
}
