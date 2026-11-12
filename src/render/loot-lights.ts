import type { IUniform, Object3D } from 'three';
import { Color, CustomBlending, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, OneFactor, OneMinusSrcAlphaFactor, PlaneGeometry, ShaderMaterial } from 'three';
import { BOLT_FRAGMENT, FLOOR_VERTEX, POOL_FRAGMENT, SHAFT_FRAGMENT, STANDING_VERTEX } from './loot-light-shaders.ts';
import type { Presence } from './shaft-motion.ts';
import { crowdShare, hidden, settle } from './shaft-motion.ts';

export const LOOT_LIGHT = {
  capacity: 64,
  renderOrder: 16,
  poolLift: 0.03,
  shaft: { width: 1.0, height: 4.6, heightPerStep: 1.0, glow: 1.25, glowPerStep: 0.3, shade: 0.62, pool: 2.0, poolPerStep: 0.4, poolGlow: 0.45, poolShade: 0.3 },
  bolt: { color: '#d4e3ff', width: 0.9, height: 2.3, glow: 1.5, shade: 0.6, pool: 1.4, poolGlow: 0.7, poolShade: 0.3 },
} as const;

export type LightKind = 'shaft' | 'bolt';

export interface LootLight {
  place(x: number, floor: number, z: number): void;
  show(on: boolean): void;
  release(): void;
}

export interface LootLights {
  readonly meshes: readonly Object3D[];
  add(kind: LightKind, color: string, step: number, seed: number): LootLight;
  update(time: number, dt: number): void;
  clear(): void;
  standIns(): Object3D[];
}

interface Look {
  readonly glow: number;
  readonly shade: number;
  readonly width: number;
  readonly height: number;
  readonly pool: number;
  readonly poolGlow: number;
  readonly poolShade: number;
}

interface Lit {
  readonly kind: LightKind;
  readonly look: Look;
  readonly tint: Color;
  readonly seed: number;
  readonly presence: Presence;
  x: number;
  floor: number;
  z: number;
  target: number;
  released: boolean;
}

interface Batch {
  readonly mesh: InstancedMesh;
  readonly matrices: Float32Array;
  readonly tint: InstancedBufferAttribute;
  readonly glow: InstancedBufferAttribute;
  readonly shade: InstancedBufferAttribute;
  readonly seed: InstancedBufferAttribute;
  readonly size: InstancedBufferAttribute;
  count: number;
}

const BLEND = { blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor } as const;

function lookOf(kind: LightKind, step: number): Look {
  const bolt = LOOT_LIGHT.bolt;
  if (kind === 'bolt') return { glow: bolt.glow, shade: bolt.shade, width: bolt.width, height: bolt.height, pool: bolt.pool, poolGlow: bolt.poolGlow, poolShade: bolt.poolShade };
  const shaft = LOOT_LIGHT.shaft;
  return { glow: shaft.glow + shaft.glowPerStep * step, shade: shaft.shade, width: shaft.width, height: shaft.height + shaft.heightPerStep * step, pool: shaft.pool + shaft.poolPerStep * step, poolGlow: shaft.poolGlow, poolShade: shaft.poolShade };
}

function attribute(size: number): InstancedBufferAttribute {
  const made: InstancedBufferAttribute = new InstancedBufferAttribute(new Float32Array(LOOT_LIGHT.capacity * size), size);
  made.setUsage(DynamicDrawUsage);
  return made;
}

function batch(geometry: PlaneGeometry, material: ShaderMaterial): Batch {
  const own: PlaneGeometry = geometry.clone();
  const matrices: Float32Array = new Float32Array(LOOT_LIGHT.capacity * 16);
  for (let index: number = 0; index < LOOT_LIGHT.capacity; index += 1) for (const diagonal of [0, 5, 10, 15]) matrices[index * 16 + diagonal] = 1;
  const made: Batch = { mesh: new InstancedMesh(own, material, LOOT_LIGHT.capacity), matrices, tint: attribute(3), glow: attribute(1), shade: attribute(1), seed: attribute(1), size: attribute(2), count: 0 };
  own.setAttribute('aTint', made.tint);
  own.setAttribute('aGlow', made.glow);
  own.setAttribute('aShade', made.shade);
  own.setAttribute('aSeed', made.seed);
  own.setAttribute('aSize', made.size);
  made.mesh.instanceMatrix = new InstancedBufferAttribute(matrices, 16);
  made.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  made.mesh.frustumCulled = false;
  made.mesh.renderOrder = LOOT_LIGHT.renderOrder;
  made.mesh.count = 0;
  return made;
}

function write(target: Batch, lit: Lit, glow: number, shade: number, y: number, width: number, height: number): void {
  const index: number = target.count;
  if (index >= LOOT_LIGHT.capacity) return;
  const matrix: Float32Array = target.matrices;
  matrix[index * 16 + 12] = lit.x;
  matrix[index * 16 + 13] = y;
  matrix[index * 16 + 14] = lit.z;
  target.tint.setXYZ(index, lit.tint.r, lit.tint.g, lit.tint.b);
  target.glow.setX(index, glow);
  target.shade.setX(index, shade);
  target.seed.setX(index, lit.seed);
  target.size.setXY(index, width, height);
  target.count = index + 1;
}

function flush(target: Batch): void {
  target.mesh.count = target.count;
  if (target.count === 0) return;
  target.mesh.instanceMatrix.needsUpdate = true;
  target.tint.needsUpdate = true;
  target.glow.needsUpdate = true;
  target.shade.needsUpdate = true;
  target.seed.needsUpdate = true;
  target.size.needsUpdate = true;
}

export function createLootLights(): LootLights {
  const time: IUniform<number> = { value: 0 };
  const material = (vertexShader: string, fragmentShader: string): ShaderMaterial => new ShaderMaterial({ uniforms: { uTime: time }, vertexShader, fragmentShader, transparent: true, depthWrite: false, side: DoubleSide, ...BLEND });
  const plane: PlaneGeometry = new PlaneGeometry(1, 1);
  const shafts: Batch = batch(plane, material(STANDING_VERTEX, SHAFT_FRAGMENT));
  const bolts: Batch = batch(plane, material(STANDING_VERTEX, BOLT_FRAGMENT));
  const pools: Batch = batch(plane, material(FLOOR_VERTEX, POOL_FRAGMENT));
  pools.mesh.renderOrder = LOOT_LIGHT.renderOrder - 1;
  plane.dispose();
  const batches: readonly Batch[] = [pools, shafts, bolts];
  const live: Lit[] = [];
  const xs: Float32Array = new Float32Array(LOOT_LIGHT.capacity);
  const zs: Float32Array = new Float32Array(LOOT_LIGHT.capacity);

  const add = (kind: LightKind, color: string, step: number, seed: number): LootLight => {
    const lit: Lit = { kind, look: lookOf(kind, step), tint: new Color(kind === 'bolt' ? LOOT_LIGHT.bolt.color : color), seed, presence: hidden(), x: 0, floor: 0, z: 0, target: 0, released: false };
    live.push(lit);
    return {
      place(x: number, floor: number, z: number): void {
        lit.x = x;
        lit.floor = floor;
        lit.z = z;
      },
      show(on: boolean): void {
        if (!lit.released) lit.target = on ? 1 : 0;
      },
      release(): void {
        lit.released = true;
        lit.target = 0;
      },
    };
  };

  return {
    meshes: batches.map((entry: Batch): Object3D => entry.mesh),
    add,
    update(now: number, dt: number): void {
      time.value = now;
      for (let index: number = live.length - 1; index >= 0; index -= 1) {
        const lit: Lit | undefined = live[index];
        if (lit === undefined) continue;
        settle(lit.presence, lit.target, dt);
        if (!lit.released || lit.presence.value > 0) continue;
        const last: Lit | undefined = live[live.length - 1];
        if (last !== undefined) live[index] = last;
        live.pop();
      }
      let crowd: number = 0;
      for (const lit of live) {
        if (lit.kind !== 'shaft' || crowd >= LOOT_LIGHT.capacity) continue;
        xs[crowd] = lit.x;
        zs[crowd] = lit.z;
        crowd += 1;
      }
      for (const entry of batches) entry.count = 0;
      let shaftIndex: number = 0;
      for (const lit of live) {
        const share: number = lit.kind === 'shaft' ? crowdShare(xs, zs, crowd, shaftIndex) : 1;
        if (lit.kind === 'shaft') shaftIndex += 1;
        const seen: number = lit.presence.value;
        if (seen <= 0) continue;
        const shining: number = seen * share;
        const look: Look = lit.look;
        write(lit.kind === 'shaft' ? shafts : bolts, lit, look.glow * shining, look.shade * seen, lit.floor, look.width, look.height);
        write(pools, lit, look.glow * look.poolGlow * shining, look.poolShade * seen, lit.floor + LOOT_LIGHT.poolLift, look.pool, look.pool);
      }
      for (const entry of batches) flush(entry);
    },
    clear(): void {
      live.length = 0;
      for (const entry of batches) {
        entry.count = 0;
        flush(entry);
      }
    },
    standIns(): Object3D[] {
      return batches.map((entry: Batch): Object3D => {
        const stand: InstancedMesh = new InstancedMesh(entry.mesh.geometry, entry.mesh.material, 1);
        stand.frustumCulled = false;
        return stand;
      });
    },
  };
}
