import type { Color, Scene } from 'three';
import { AdditiveBlending, BufferAttribute, BufferGeometry, DynamicDrawUsage, Points, ShaderMaterial } from 'three';

export const PARTICLES = {
  capacity: 2400,
  pointScale: 520,
} as const;

export interface Range {
  readonly min: number;
  readonly max: number;
}

export interface BurstOptions {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly count: number;
  readonly color: Color;
  readonly speed: Range;
  readonly lift: Range;
  readonly life: Range;
  readonly size: Range;
  readonly gravity: number;
  readonly drag: number;
  readonly dirX: number;
  readonly dirZ: number;
  readonly spread: number;
  readonly jitter: number;
}

export interface ParticleSystem {
  burst(options: BurstOptions): void;
  update(dt: number): void;
  clear(): void;
}

const VERTEX: string = `
attribute float size;
attribute float alpha;
attribute vec3 tint;
uniform float uScale;
varying float vAlpha;
varying vec3 vTint;
void main() {
  vAlpha = alpha;
  vTint = tint;
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(0.1, -view.z);
  gl_Position = projectionMatrix * view;
}
`;

const FRAGMENT: string = `
varying float vAlpha;
varying vec3 vTint;
void main() {
  vec2 offset = gl_PointCoord - vec2(0.5);
  float falloff = 1.0 - smoothstep(0.0, 0.5, length(offset));
  gl_FragColor = vec4(vTint * falloff * vAlpha, falloff * vAlpha);
}
`;

function pick(range: Range): number {
  return range.min + (range.max - range.min) * Math.random();
}

export function createParticles(scene: Scene): ParticleSystem {
  const capacity: number = PARTICLES.capacity;
  const positions: Float32Array = new Float32Array(capacity * 3);
  const tints: Float32Array = new Float32Array(capacity * 3);
  const sizes: Float32Array = new Float32Array(capacity);
  const alphas: Float32Array = new Float32Array(capacity);
  const velocities: Float32Array = new Float32Array(capacity * 3);
  const lives: Float32Array = new Float32Array(capacity);
  const spans: Float32Array = new Float32Array(capacity);
  const baseSizes: Float32Array = new Float32Array(capacity);
  const gravities: Float32Array = new Float32Array(capacity);
  const drags: Float32Array = new Float32Array(capacity);
  let cursor: number = 0;

  const geometry: BufferGeometry = new BufferGeometry();
  const positionAttribute: BufferAttribute = new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage);
  const tintAttribute: BufferAttribute = new BufferAttribute(tints, 3).setUsage(DynamicDrawUsage);
  const sizeAttribute: BufferAttribute = new BufferAttribute(sizes, 1).setUsage(DynamicDrawUsage);
  const alphaAttribute: BufferAttribute = new BufferAttribute(alphas, 1).setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('tint', tintAttribute);
  geometry.setAttribute('size', sizeAttribute);
  geometry.setAttribute('alpha', alphaAttribute);
  const material: ShaderMaterial = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { uScale: { value: PARTICLES.pointScale } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const points: Points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 10;
  scene.add(points);

  return {
    burst(options: BurstOptions): void {
      for (let spawned: number = 0; spawned < options.count; spawned += 1) {
        const index: number = cursor;
        cursor = (cursor + 1) % capacity;
        const baseAngle: number = Math.atan2(options.dirX, options.dirZ);
        const angle: number = baseAngle + (Math.random() - 0.5) * options.spread;
        const speed: number = pick(options.speed);
        positions[index * 3] = options.x + (Math.random() - 0.5) * options.jitter;
        positions[index * 3 + 1] = options.y + (Math.random() - 0.5) * options.jitter;
        positions[index * 3 + 2] = options.z + (Math.random() - 0.5) * options.jitter;
        velocities[index * 3] = Math.sin(angle) * speed;
        velocities[index * 3 + 1] = pick(options.lift);
        velocities[index * 3 + 2] = Math.cos(angle) * speed;
        tints[index * 3] = options.color.r;
        tints[index * 3 + 1] = options.color.g;
        tints[index * 3 + 2] = options.color.b;
        const life: number = pick(options.life);
        lives[index] = life;
        spans[index] = life;
        baseSizes[index] = pick(options.size);
        gravities[index] = options.gravity;
        drags[index] = options.drag;
      }
    },
    update(dt: number): void {
      for (let index: number = 0; index < capacity; index += 1) {
        const life: number = lives[index] ?? 0;
        if (life <= 0) {
          alphas[index] = 0;
          continue;
        }
        const next: number = life - dt;
        lives[index] = next;
        const drag: number = Math.exp(-(drags[index] ?? 0) * dt);
        const vx: number = (velocities[index * 3] ?? 0) * drag;
        const vy: number = ((velocities[index * 3 + 1] ?? 0) - (gravities[index] ?? 0) * dt) * drag;
        const vz: number = (velocities[index * 3 + 2] ?? 0) * drag;
        velocities[index * 3] = vx;
        velocities[index * 3 + 1] = vy;
        velocities[index * 3 + 2] = vz;
        positions[index * 3] = (positions[index * 3] ?? 0) + vx * dt;
        positions[index * 3 + 1] = Math.max(0.03, (positions[index * 3 + 1] ?? 0) + vy * dt);
        positions[index * 3 + 2] = (positions[index * 3 + 2] ?? 0) + vz * dt;
        const t: number = Math.max(0, next) / Math.max(1e-4, spans[index] ?? 1);
        alphas[index] = Math.min(1, t * 2.2);
        sizes[index] = (baseSizes[index] ?? 0) * (0.35 + 0.65 * t);
      }
      positionAttribute.needsUpdate = true;
      tintAttribute.needsUpdate = true;
      sizeAttribute.needsUpdate = true;
      alphaAttribute.needsUpdate = true;
    },
    clear(): void {
      lives.fill(0);
    },
  };
}
