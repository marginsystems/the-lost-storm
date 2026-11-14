import type { Object3D } from 'three';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Mesh, ShaderMaterial } from 'three';
import type { StrandBuffers, StrandEnds, StrandForm } from './strand-shape.ts';
import { createStrandBuffers, STRAND_POINTS, strandLight, strandSpan, strandStrips, writeStrand } from './strand-shape.ts';

export const STRANDS = {
  width: 0.3,
  coreSharp: 40,
  haloSharp: 3,
  coreBoost: 1.3,
  haloBoost: 0.5,
  whiten: 0.7,
  order: 9,
  fadeShare: 1,
} as const;

const glsl = (value: number): string => value.toFixed(4);

export const STRAND_VERTEX: string = [
  'attribute vec3 heading;',
  'attribute float side;',
  'attribute float weight;',
  'uniform float uWidth;',
  'varying float vSide;',
  'varying float vWeight;',
  'void main() {',
  '  vec4 view = modelViewMatrix * vec4(position, 1.0);',
  '  vec3 facing = (modelViewMatrix * vec4(heading, 0.0)).xyz;',
  '  vec2 flat2 = facing.xy;',
  '  float span = length(flat2);',
  '  vec2 across = span > 0.0001 ? vec2(-flat2.y, flat2.x) / span : vec2(0.0, 1.0);',
  '  view.xy += across * side * uWidth * weight;',
  '  vSide = side;',
  '  vWeight = weight;',
  '  gl_Position = projectionMatrix * view;',
  '}',
].join('\n');

export const STRAND_FRAGMENT: string = [
  'uniform vec3 uColor;',
  'uniform float uStrength;',
  'uniform float uGlow;',
  'uniform float uCore;',
  'varying float vSide;',
  'varying float vWeight;',
  'void main() {',
  '  float x2 = vSide * vSide;',
  `  float core = exp(-x2 * ${glsl(STRANDS.coreSharp)}) * uCore;`,
  `  float halo = exp(-x2 * ${glsl(STRANDS.haloSharp)}) * uGlow;`,
  `  float energy = (core * ${glsl(STRANDS.coreBoost)} + halo * ${glsl(STRANDS.haloBoost)}) * uStrength * vWeight;`,
  `  vec3 tint = mix(uColor, vec3(1.0), core * ${glsl(STRANDS.whiten)});`,
  '  gl_FragColor = vec4(tint * energy, 1.0);',
  '}',
].join('\n');

export type StrandMode = 'free' | 'strike' | 'held' | 'fading';

export interface StrandLook extends StrandForm {
  readonly glow: number;
  readonly afterglow: number;
  readonly width: number;
  readonly core: number;
}

export interface StrandHandle {
  shape(from: StrandEnds, to: StrandEnds, random: () => number): void;
  light(strength: number): void;
  fade(): void;
}

export interface Strands {
  strike(from: StrandEnds, to: StrandEnds, color: Color, look: StrandLook, delay: number, restrike: boolean): boolean;
  hold(color: Color, look: StrandLook): StrandHandle | null;
  update(dt: number): void;
  clear(): void;
  readonly active: number;
  readonly capacity: number;
}

interface Slot {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  readonly buffers: StrandBuffers;
  readonly positions: BufferAttribute;
  readonly tangents: BufferAttribute;
  readonly weights: BufferAttribute;
  readonly positionData: Float32Array;
  readonly tangentData: Float32Array;
  readonly weightData: Float32Array;
  readonly color: Color;
  readonly strength: { value: number };
  readonly glow: { value: number };
  readonly width: { value: number };
  readonly core: { value: number };
  mode: StrandMode;
  age: number;
  delay: number;
  afterglow: number;
  restrike: boolean;
  held: number;
  form: StrandForm;
}

const STRIPS: readonly (readonly [number, number])[] = strandStrips();

function stripIndices(): number[] {
  const indices: number[] = [];
  for (const [start, count] of STRIPS) {
    for (let point: number = start; point < start + count - 1; point += 1) {
      const a: number = point * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  return indices;
}

function expand(slot: Slot): void {
  const points: Float32Array = slot.buffers.points;
  const positions: Float32Array = slot.positionData;
  const tangents: Float32Array = slot.tangentData;
  const weights: Float32Array = slot.weightData;
  for (const [start, count] of STRIPS) {
    for (let point: number = start; point < start + count; point += 1) {
      const before: number = Math.max(start, point - 1);
      const after: number = Math.min(start + count - 1, point + 1);
      for (let axis: number = 0; axis < 3; axis += 1) {
        const at: number = points[point * 3 + axis] ?? 0;
        const toward: number = (points[after * 3 + axis] ?? 0) - (points[before * 3 + axis] ?? 0);
        positions[point * 6 + axis] = at;
        positions[point * 6 + 3 + axis] = at;
        tangents[point * 6 + axis] = toward;
        tangents[point * 6 + 3 + axis] = toward;
      }
      const weight: number = slot.buffers.weights[point] ?? 0;
      weights[point * 2] = weight;
      weights[point * 2 + 1] = weight;
    }
  }
  slot.positions.needsUpdate = true;
  slot.tangents.needsUpdate = true;
  slot.weights.needsUpdate = true;
}

function createSlot(indices: readonly number[]): Slot {
  const geometry: BufferGeometry = new BufferGeometry();
  const positionData: Float32Array = new Float32Array(STRAND_POINTS * 6);
  const tangentData: Float32Array = new Float32Array(STRAND_POINTS * 6);
  const weightData: Float32Array = new Float32Array(STRAND_POINTS * 2);
  const positions: BufferAttribute = new BufferAttribute(positionData, 3).setUsage(DynamicDrawUsage);
  const tangents: BufferAttribute = new BufferAttribute(tangentData, 3).setUsage(DynamicDrawUsage);
  const weights: BufferAttribute = new BufferAttribute(weightData, 1).setUsage(DynamicDrawUsage);
  const sides: Float32Array = new Float32Array(STRAND_POINTS * 2);
  for (let point: number = 0; point < STRAND_POINTS; point += 1) {
    sides[point * 2] = -1;
    sides[point * 2 + 1] = 1;
  }
  geometry.setAttribute('position', positions);
  geometry.setAttribute('heading', tangents);
  geometry.setAttribute('weight', weights);
  geometry.setAttribute('side', new BufferAttribute(sides, 1));
  geometry.setIndex([...indices]);
  const color: Color = new Color();
  const strength: { value: number } = { value: 0 };
  const glow: { value: number } = { value: 0 };
  const width: { value: number } = { value: STRANDS.width };
  const core: { value: number } = { value: 1 };
  const material: ShaderMaterial = new ShaderMaterial({
    vertexShader: STRAND_VERTEX,
    fragmentShader: STRAND_FRAGMENT,
    uniforms: { uColor: { value: color }, uStrength: strength, uGlow: glow, uWidth: width, uCore: core },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  });
  const mesh: Mesh<BufferGeometry, ShaderMaterial> = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = STRANDS.order;
  mesh.visible = false;
  return { mesh, buffers: createStrandBuffers(), positions, tangents, weights, positionData, tangentData, weightData, color, strength, glow, width, core, mode: 'free', age: 0, delay: 0, afterglow: 0, restrike: false, held: 0, form: { forks: 0, jitter: 0 } };
}

export function createStrands(parent: Object3D, capacity: number, random: () => number = Math.random): Strands {
  const indices: number[] = stripIndices();
  const slots: Slot[] = [];
  for (let index: number = 0; index < Math.max(1, Math.floor(capacity)); index += 1) {
    const slot: Slot = createSlot(indices);
    parent.add(slot.mesh);
    slots.push(slot);
  }

  const free = (slot: Slot): void => {
    slot.mode = 'free';
    slot.strength.value = 0;
    slot.mesh.visible = false;
  };

  const claim = (): Slot | null => {
    let oldest: Slot | null = null;
    for (const slot of slots) {
      if (slot.mode === 'free') return slot;
      if (slot.mode !== 'held' && (oldest === null || slot.age - slot.delay > oldest.age - oldest.delay)) oldest = slot;
    }
    return oldest;
  };

  const dress = (slot: Slot, color: Color, look: StrandLook): void => {
    slot.color.copy(color);
    slot.glow.value = look.glow;
    slot.width.value = STRANDS.width * look.width;
    slot.core.value = look.core;
    slot.afterglow = look.afterglow;
    slot.form = look;
    slot.age = 0;
    slot.delay = 0;
  };

  return {
    get capacity(): number {
      return slots.length;
    },
    get active(): number {
      let count: number = 0;
      for (const slot of slots) if (slot.mode !== 'free') count += 1;
      return count;
    },
    strike(from: StrandEnds, to: StrandEnds, color: Color, look: StrandLook, delay: number, restrike: boolean): boolean {
      const slot: Slot | null = claim();
      if (slot === null) return false;
      dress(slot, color, look);
      slot.mode = 'strike';
      slot.delay = Math.max(0, delay);
      slot.restrike = restrike;
      slot.strength.value = 0;
      writeStrand(from, to, look, random, slot.buffers);
      expand(slot);
      slot.mesh.visible = true;
      return true;
    },
    hold(color: Color, look: StrandLook): StrandHandle | null {
      const slot: Slot | null = claim();
      if (slot === null) return null;
      dress(slot, color, look);
      slot.mode = 'held';
      slot.held = 0;
      slot.strength.value = 0;
      return {
        shape(from: StrandEnds, to: StrandEnds, pick: () => number): void {
          if (slot.mode !== 'held') return;
          writeStrand(from, to, slot.form, pick, slot.buffers);
          expand(slot);
          slot.mesh.visible = true;
        },
        light(strength: number): void {
          if (slot.mode !== 'held') return;
          slot.held = Math.max(0, strength);
          slot.strength.value = slot.held;
        },
        fade(): void {
          if (slot.mode !== 'held') return;
          slot.mode = 'fading';
          slot.age = 0;
        },
      };
    },
    update(dt: number): void {
      for (const slot of slots) {
        if (slot.mode === 'strike') {
          slot.age += dt;
          const age: number = slot.age - slot.delay;
          slot.strength.value = strandLight(age, slot.afterglow, slot.restrike);
          if (age >= strandSpan(slot.afterglow)) free(slot);
        } else if (slot.mode === 'fading') {
          slot.age += dt;
          const share: number = Math.min(1, slot.age / (slot.afterglow * STRANDS.fadeShare));
          slot.strength.value = slot.held * (1 - share) * (1 - share);
          if (share >= 1) free(slot);
        }
      }
    },
    clear(): void {
      for (const slot of slots) free(slot);
    },
  };
}
