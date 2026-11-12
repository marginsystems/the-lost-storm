import type { BufferGeometry, IUniform, Object3D } from 'three';
import { Color, CustomBlending, DoubleSide, Group, Mesh, OneFactor, OneMinusSrcAlphaFactor, PlaneGeometry, ShaderMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Presence } from './shaft-motion.ts';
import { HIDDEN } from './shaft-motion.ts';

export const SHAFT = {
  width: 1.1,
  height: 5.2,
  heightPerRank: 1.8,
  glow: 0.75,
  glowPerRank: 0.35,
  veil: 0.5,
  pool: 2.6,
  poolPerRank: 0.6,
  poolGlow: 0.35,
  poolLift: 0.03,
  driftShare: 0.22,
  driftFallbackMs: 5200,
  renderOrder: 7,
  rows: 26,
  columns: 5,
} as const;

const HALF_TURN: number = Math.PI / 2;

const SHAFT_VERTEX: string = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SHAFT_FRAGMENT: string = `
uniform vec3 uColor;
uniform float uGlow;
uniform float uTime;
uniform float uDrift;
uniform float uSeed;
uniform float uRows;
uniform float uColumns;
uniform float uVeil;
varying vec2 vUv;
float shaftHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  float across = vUv.x * 2.0 - 1.0;
  float body = exp(-across * across * 7.0);
  float core = exp(-across * across * 70.0);
  float rise = pow(1.0 - vUv.y, 2.4);
  float climb = vUv.y - uTime * uDrift + uSeed;
  vec2 grid = vec2(vUv.x * uColumns, climb * uRows);
  vec2 cell = floor(grid);
  vec2 inside = fract(grid) - 0.5;
  float mote = step(0.9, shaftHash(cell)) * smoothstep(0.2, 0.0, length(inside * vec2(1.0, 2.2)));
  float light = (body * 0.7 + core * 0.45) * rise + mote * body * (1.0 - vUv.y) * 0.5;
  float lit = light * uGlow;
  gl_FragColor = vec4(uColor * lit, clamp(lit * uVeil, 0.0, 1.0));
}
`;

const POOL_FRAGMENT: string = `
uniform vec3 uColor;
uniform float uGlow;
uniform float uVeil;
varying vec2 vUv;
void main() {
  float d = length(vUv * 2.0 - 1.0);
  float lit = exp(-d * d * 5.0) * clamp(1.0 - d, 0.0, 1.0) * uGlow;
  gl_FragColor = vec4(uColor * lit, clamp(lit * uVeil, 0.0, 1.0));
}
`;

export interface Shaft {
  readonly group: Group;
  readonly materials: readonly ShaderMaterial[];
  readonly columnGlow: IUniform<number>;
  readonly poolGlow: IUniform<number>;
  readonly time: IUniform<number>;
  readonly glow: number;
  presence: Presence;
}

export interface ShaftKit {
  create(color: Color, step: number, seed: number): Shaft;
  update(shaft: Shaft, share: number, time: number): void;
  dispose(shaft: Shaft): void;
  standIn(): Object3D;
}

function crossedColumn(): BufferGeometry {
  const planes: BufferGeometry[] = [0, HALF_TURN].map((yaw: number): BufferGeometry => {
    const plane: PlaneGeometry = new PlaneGeometry(1, 1);
    plane.rotateY(yaw);
    plane.translate(0, 0.5, 0);
    return plane;
  });
  return mergeGeometries(planes);
}

function flatPool(): BufferGeometry {
  const plane: PlaneGeometry = new PlaneGeometry(1, 1);
  plane.rotateX(-HALF_TURN);
  return plane;
}

function shaftMaterial(fragmentShader: string, color: Color, seed: number, drift: number, depthTest: boolean, glow: IUniform<number>, time: IUniform<number>): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: color.clone() },
      uGlow: glow,
      uTime: time,
      uDrift: { value: drift },
      uSeed: { value: seed },
      uRows: { value: SHAFT.rows },
      uColumns: { value: SHAFT.columns },
      uVeil: { value: SHAFT.veil },
    },
    vertexShader: SHAFT_VERTEX,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest,
    side: DoubleSide,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
  });
}

export function driftSeconds(): number {
  const raw: string = getComputedStyle(document.documentElement).getPropertyValue('--drift-ms');
  const ms: number = Number.parseFloat(raw);
  return (Number.isFinite(ms) && ms > 0 ? ms : SHAFT.driftFallbackMs) / 1000;
}

export function createShaftKit(seconds: number): ShaftKit {
  const column: BufferGeometry = crossedColumn();
  const pool: BufferGeometry = flatPool();
  const drift: number = SHAFT.driftShare / seconds;

  const create = (color: Color, step: number, seed: number): Shaft => {
    const group: Group = new Group();
    const columnGlow: IUniform<number> = { value: 0 };
    const poolGlow: IUniform<number> = { value: 0 };
    const time: IUniform<number> = { value: 0 };
    const columnMaterial: ShaderMaterial = shaftMaterial(SHAFT_FRAGMENT, color, seed, drift, false, columnGlow, time);
    const poolMaterial: ShaderMaterial = shaftMaterial(POOL_FRAGMENT, color, seed, drift, true, poolGlow, time);
    const shaft: Mesh = new Mesh(column, columnMaterial);
    shaft.scale.set(SHAFT.width, SHAFT.height + SHAFT.heightPerRank * step, SHAFT.width);
    shaft.renderOrder = SHAFT.renderOrder;
    const ground: Mesh = new Mesh(pool, poolMaterial);
    const reach: number = SHAFT.pool + SHAFT.poolPerRank * step;
    ground.scale.set(reach, 1, reach);
    ground.position.y = SHAFT.poolLift;
    ground.renderOrder = SHAFT.renderOrder;
    group.add(shaft, ground);
    group.visible = false;
    return { group, materials: [columnMaterial, poolMaterial], columnGlow, poolGlow, time, glow: SHAFT.glow + SHAFT.glowPerRank * step, presence: HIDDEN };
  };

  return {
    create,
    update(shaft: Shaft, share: number, time: number): void {
      const glow: number = shaft.glow * shaft.presence.value * share;
      shaft.group.visible = glow > 0;
      shaft.columnGlow.value = glow;
      shaft.poolGlow.value = glow * SHAFT.poolGlow;
      shaft.time.value = time;
    },
    dispose(shaft: Shaft): void {
      shaft.group.removeFromParent();
      for (const material of shaft.materials) material.dispose();
    },
    standIn(): Object3D {
      const shaft: Shaft = create(new Color(1, 1, 1), 0, 0);
      shaft.group.visible = true;
      return shaft.group;
    },
  };
}
