import type { IUniform } from 'three';
import { Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, PlaneGeometry, ShaderMaterial, Vector2, Vector4 } from 'three';
import type { Rng } from '../../sim/rng.ts';
import { createRng } from '../../sim/rng.ts';
import type { Vec2 } from '../../sim/math.ts';
import type { WakeStage } from '../../sim/world/wake.ts';
import type { QualityName } from '../mobile/quality.ts';
import { WAKE_SHOT } from '../opening/wake-shot.ts';
import { WISP_FRAGMENT, WISP_VERTEX } from './void-shaders.ts';

export const WAKE_WISPS = {
  counts: { desktop: 30, mobile: 14 },
  octaves: { desktop: 3, mobile: 2 },
  seed: 7919,
  facingShare: 0.5,
  facingSpread: 1.1,
  near: { min: 1.1, max: 3.2 },
  around: { min: 0.7, max: 4.2 },
  height: { min: 0.05, max: 1.1 },
  size: { min: 1.6, max: 3.4 },
  opacity: { min: 0.35, max: 0.6 },
  spin: 0.05,
  sway: { amount: 0.18, rate: 0.27 },
  bob: { amount: 0.06, rate: 0.41 },
  stirPush: 0.35,
  travel: 5.5,
  travelPerMetre: 1.2,
  lift: 0.45,
  fade: { from: 0.2, to: 0.8 },
  glowUntil: 0.55,
  flatten: 0.5,
  eye: { near: 0.9, far: 2.2 },
  body: { inner: 0.25, outer: 1.1, keep: 0.3 },
  shade: 0xb4bbc4,
  keySide: [-0.8, 0.6],
  mist: 0xeef0f2,
} as const;

export interface Wisp {
  readonly angle: number;
  readonly radius: number;
  readonly height: number;
  readonly size: number;
  readonly opacity: number;
  readonly spin: number;
  readonly phase: number;
  readonly seed: number;
}

export interface WispState {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly size: number;
  readonly alpha: number;
  readonly glow: number;
}

export interface WakeWisps {
  readonly mesh: Mesh;
  update(hero: Vec2, floor: number, stage: WakeStage | null, time: number): void;
  dispose(): void;
}

function smooth(edge0: number, edge1: number, value: number): number {
  const t: number = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function wispLayout(count: number, rng: Rng): Wisp[] {
  const toward: number = (WAKE_SHOT.start.yawDegrees * Math.PI) / 180;
  const wisps: Wisp[] = [];
  for (let index: number = 0; index < count; index += 1) {
    const facing: boolean = index < Math.round(count * WAKE_WISPS.facingShare);
    const angle: number = facing ? toward + rng.range(-WAKE_WISPS.facingSpread, WAKE_WISPS.facingSpread) : rng.range(0, Math.PI * 2);
    const band = facing ? WAKE_WISPS.near : WAKE_WISPS.around;
    wisps.push({
      angle,
      radius: rng.range(band.min, band.max),
      height: rng.range(WAKE_WISPS.height.min, WAKE_WISPS.height.max),
      size: rng.range(WAKE_WISPS.size.min, WAKE_WISPS.size.max),
      opacity: rng.range(WAKE_WISPS.opacity.min, WAKE_WISPS.opacity.max),
      spin: rng.range(-WAKE_WISPS.spin, WAKE_WISPS.spin),
      phase: rng.range(0, Math.PI * 2),
      seed: rng.next(),
    });
  }
  return wisps;
}

export function wispPush(front: number): number {
  const t: number = Math.min(1, Math.max(0, front));
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

export function wispState(wisp: Wisp, stage: WakeStage | null, time: number): WispState {
  if (stage === null) return { x: 0, y: 0, z: 0, size: wisp.size, alpha: 0, glow: 0 };
  const push: number = wispPush(stage.front);
  const ripple: number = WAKE_WISPS.stirPush * Math.sin(Math.PI * Math.min(1, Math.max(0, stage.stir)));
  const radius: number = wisp.radius + WAKE_WISPS.sway.amount * Math.sin(time * WAKE_WISPS.sway.rate + wisp.phase) + ripple + push * (WAKE_WISPS.travel + wisp.radius * WAKE_WISPS.travelPerMetre);
  const angle: number = wisp.angle + wisp.spin * time;
  const fade: number = 1 - smooth(WAKE_WISPS.fade.from, WAKE_WISPS.fade.to, stage.front);
  return {
    x: Math.sin(angle) * radius,
    y: wisp.height + WAKE_WISPS.bob.amount * Math.sin(time * WAKE_WISPS.bob.rate + wisp.phase * 1.7) + push * WAKE_WISPS.lift,
    z: Math.cos(angle) * radius,
    size: wisp.size * (1 + push * 0.4),
    alpha: wisp.opacity * fade,
    glow: Math.sin(Math.PI * Math.min(1, stage.front / WAKE_WISPS.glowUntil)),
  };
}

export function createWakeWisps(quality: QualityName, time: IUniform<number>, body: IUniform<Vector4>, dither: IUniform<number>): WakeWisps {
  const count: number = WAKE_WISPS.counts[quality];
  const wisps: Wisp[] = wispLayout(count, createRng(WAKE_WISPS.seed));
  const plane: PlaneGeometry = new PlaneGeometry(1, 1);
  const geometry: InstancedBufferGeometry = new InstancedBufferGeometry();
  geometry.index = plane.index;
  geometry.setAttribute('position', plane.getAttribute('position'));
  geometry.instanceCount = count;
  const centres: InstancedBufferAttribute = new InstancedBufferAttribute(new Float32Array(count * 3), 3);
  const looks: InstancedBufferAttribute = new InstancedBufferAttribute(new Float32Array(count * 4), 4);
  centres.setUsage(DynamicDrawUsage);
  looks.setUsage(DynamicDrawUsage);
  geometry.setAttribute('aCentre', centres);
  geometry.setAttribute('aLook', looks);
  const material: ShaderMaterial = new ShaderMaterial({
    uniforms: {
      uTime: time,
      uBody: body,
      uDither: dither,
      uMist: { value: new Color(WAKE_WISPS.mist) },
      uShade: { value: new Color(WAKE_WISPS.shade) },
      uFlatten: { value: WAKE_WISPS.flatten },
      uKeySide: { value: new Vector2(WAKE_WISPS.keySide[0], WAKE_WISPS.keySide[1]) },
      uEye: { value: new Vector4(WAKE_WISPS.eye.near, WAKE_WISPS.eye.far, 0, 0) },
      uBodyClear: { value: new Vector4(WAKE_WISPS.body.inner, WAKE_WISPS.body.outer, WAKE_WISPS.body.keep, 0) },
    },
    defines: { VOID_OCTAVES: WAKE_WISPS.octaves[quality] },
    vertexShader: WISP_VERTEX,
    fragmentShader: WISP_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
  const mesh: Mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  mesh.visible = false;
  return {
    mesh,
    update(hero: Vec2, floor: number, stage: WakeStage | null, now: number): void {
      let shown: boolean = false;
      wisps.forEach((wisp: Wisp, index: number): void => {
        const state: WispState = wispState(wisp, stage, now);
        centres.setXYZ(index, hero.x + state.x, floor + state.y, hero.z + state.z);
        looks.setXYZW(index, state.size, state.alpha, wisp.seed, state.glow);
        if (state.alpha > 0) shown = true;
      });
      centres.needsUpdate = true;
      looks.needsUpdate = true;
      mesh.visible = shown;
    },
    dispose(): void {
      plane.dispose();
      geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    },
  };
}
