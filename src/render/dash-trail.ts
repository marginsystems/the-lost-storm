import type { Color, Scene } from 'three';
import { BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, Mesh, ShaderMaterial } from 'three';
import type { Vec2 } from '../../sim/math.ts';
import { isDashing } from '../../sim/world/dash.ts';
import type { Actor, MonsterState, World } from '../../sim/world/types.ts';
import type { BurstOptions, ParticleSystem } from './particles.ts';

export const DASH_TRAIL = {
  samples: 24,
  fade: 0.22,
  low: 0.25,
  high: 1.25,
  opacity: 0.32,
  puffCount: 14,
  puffLift: 0.15,
  kickEvery: 0.6,
  kickCount: 3,
  dustShade: 0.55,
  footFade: 0.4,
  feather: 0.45,
  wakeSpread: Math.PI * 0.9,
  kickSpread: Math.PI * 0.6,
  dust: {
    speed: { min: 0.6, max: 2.4 },
    lift: { min: 0.4, max: 1.6 },
    life: { min: 0.35, max: 0.75 },
    size: { min: 0.6, max: 1.3 },
    gravity: 1.2,
    drag: 3,
    spread: Math.PI * 2,
    jitter: 0.5,
  },
} as const;

interface Sample {
  readonly x: number;
  readonly z: number;
  age: number;
}

interface Trail {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  readonly positions: Float32Array;
  readonly alphas: Float32Array;
  readonly samples: Sample[];
  readonly color: Color;
  readonly direction: Vec2;
  travelled: number;
  live: boolean;
}

export interface DashTrails {
  start(actorId: number, from: Vec2, direction: Vec2, color: Color): void;
  land(at: Vec2, direction: Vec2, color: Color): void;
  update(dt: number, world: World): void;
  clear(): void;
}

const VERTEX: string = `
attribute float alpha;
varying float vAlpha;
varying float vHeight;
void main() {
  vAlpha = alpha;
  vHeight = position.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT: string = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
varying float vHeight;
void main() {
  float top = 1.0 - smoothstep(${(DASH_TRAIL.high - DASH_TRAIL.feather).toFixed(3)}, ${DASH_TRAIL.high.toFixed(3)}, vHeight);
  float foot = smoothstep(${DASH_TRAIL.low.toFixed(3)}, ${(DASH_TRAIL.low + DASH_TRAIL.feather * 0.5).toFixed(3)}, vHeight);
  gl_FragColor = vec4(uColor, vAlpha * uOpacity * top * foot);
}
`;

function actorOf(world: World, id: number): Actor | null {
  if (world.player.id === id) return world.player;
  return world.monsters.find((monster: MonsterState): boolean => monster.id === id) ?? null;
}

function trailMesh(color: Color): Trail {
  const count: number = DASH_TRAIL.samples;
  const positions: Float32Array = new Float32Array(count * 2 * 3);
  const alphas: Float32Array = new Float32Array(count * 2);
  const indices: number[] = [];
  for (let index: number = 0; index < count - 1; index += 1) {
    const a: number = index * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage));
  geometry.setAttribute('alpha', new BufferAttribute(alphas, 1).setUsage(DynamicDrawUsage));
  geometry.setIndex(indices);
  const material: ShaderMaterial = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { uColor: { value: color }, uOpacity: { value: DASH_TRAIL.opacity } },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh: Mesh<BufferGeometry, ShaderMaterial> = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { mesh, positions, alphas, samples: [], color, direction: { x: 0, z: 1 }, travelled: 0, live: true };
}

function writeTrail(trail: Trail): void {
  const last: number = DASH_TRAIL.samples - 1;
  for (let index: number = 0; index <= last; index += 1) {
    const sample: Sample | undefined = trail.samples[Math.min(index, trail.samples.length - 1)];
    const x: number = sample?.x ?? 0;
    const z: number = sample?.z ?? 0;
    const fade: number = sample === undefined || index >= trail.samples.length ? 0 : Math.max(0, 1 - sample.age / DASH_TRAIL.fade);
    const base: number = index * 6;
    trail.positions.set([x, DASH_TRAIL.low, z, x, DASH_TRAIL.high, z], base);
    trail.alphas[index * 2] = fade * DASH_TRAIL.footFade;
    trail.alphas[index * 2 + 1] = fade;
  }
  const position: unknown = trail.mesh.geometry.getAttribute('position');
  const alpha: unknown = trail.mesh.geometry.getAttribute('alpha');
  if (position instanceof BufferAttribute) position.needsUpdate = true;
  if (alpha instanceof BufferAttribute) alpha.needsUpdate = true;
}

export function createDashTrails(scene: Scene, particles: ParticleSystem): DashTrails {
  const trails: Map<number, Trail> = new Map<number, Trail>();

  const dust = (x: number, z: number, color: Color, count: number, overrides: Partial<BurstOptions>): void => {
    particles.burst({ x, y: DASH_TRAIL.puffLift, z, count, color, dirX: 0, dirZ: 1, ...DASH_TRAIL.dust, ...overrides });
  };

  const drop = (actorId: number, trail: Trail): void => {
    trail.mesh.removeFromParent();
    trail.mesh.geometry.dispose();
    trail.mesh.material.dispose();
    trails.delete(actorId);
  };

  return {
    start(actorId: number, from: Vec2, direction: Vec2, color: Color): void {
      const old: Trail | undefined = trails.get(actorId);
      if (old !== undefined) drop(actorId, old);
      const shade: Color = color.clone().multiplyScalar(DASH_TRAIL.dustShade);
      const trail: Trail = { ...trailMesh(color), direction: { x: direction.x, z: direction.z } };
      trail.samples.push({ x: from.x, z: from.z, age: 0 });
      scene.add(trail.mesh);
      trails.set(actorId, trail);
      dust(from.x, from.z, shade, DASH_TRAIL.puffCount, { dirX: -direction.x, dirZ: -direction.z, spread: DASH_TRAIL.wakeSpread });
    },
    land(at: Vec2, direction: Vec2, color: Color): void {
      dust(at.x, at.z, color.clone().multiplyScalar(DASH_TRAIL.dustShade), DASH_TRAIL.puffCount, { dirX: direction.x, dirZ: direction.z, spread: DASH_TRAIL.wakeSpread });
    },
    update(dt: number, world: World): void {
      for (const [actorId, trail] of trails) {
        for (const sample of trail.samples) sample.age += dt;
        const actor: Actor | null = actorOf(world, actorId);
        trail.live = trail.live && actor !== null && isDashing(actor);
        if (trail.live && actor !== null) {
          const head: Sample | undefined = trail.samples[0];
          const step: number = head === undefined ? 0 : Math.hypot(actor.pos.x - head.x, actor.pos.z - head.z);
          trail.samples.unshift({ x: actor.pos.x, z: actor.pos.z, age: 0 });
          trail.travelled += step;
          if (trail.travelled >= DASH_TRAIL.kickEvery) {
            trail.travelled = 0;
            dust(actor.pos.x, actor.pos.z, trail.color.clone().multiplyScalar(DASH_TRAIL.dustShade), DASH_TRAIL.kickCount, { dirX: -trail.direction.x, dirZ: -trail.direction.z, spread: DASH_TRAIL.kickSpread });
          }
        }
        if (trail.samples.length > DASH_TRAIL.samples) trail.samples.length = DASH_TRAIL.samples;
        const newest: Sample | undefined = trail.samples[0];
        if (!trail.live && (newest === undefined || newest.age >= DASH_TRAIL.fade)) {
          drop(actorId, trail);
          continue;
        }
        writeTrail(trail);
      }
    },
    clear(): void {
      for (const [actorId, trail] of trails) drop(actorId, trail);
    },
  };
}
