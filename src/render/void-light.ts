import type { BufferGeometry, IUniform } from 'three';
import { AdditiveBlending, Color, DoubleSide, Group, Mesh, PlaneGeometry, PointLight, ShaderMaterial, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ZoneExit } from '../../sim/content/types.ts';
import { allHold } from '../../sim/world/conditions.ts';
import type { EncounterState, World } from '../../sim/world/types.ts';

export const VOID_LIGHT = {
  color: 0xffc27a,
  pillarWidth: 7,
  pillarHeight: 30,
  pillarOpacity: 0.34,
  pillarFalloff: 2.2,
  coreColor: 0xfff4e2,
  poolCore: 6,
  pillarCore: 3,
  glowRadius: 7.5,
  glowOpacity: 0.42,
  glowFalloff: 2.6,
  rise: 0.9,
  breathe: 0.12,
  breatheRate: 0.9,
  flicker: 0.1,
  flickerRates: [5.3, 8.9],
  renderOrder: 20,
  fireIntensity: 14,
  fireDistance: 16,
  fireDecay: 1.2,
  fireHeight: 3,
} as const;

export interface VoidLight {
  readonly group: Group;
  readonly uniform: IUniform<Vector3>;
  update(world: World, now: number, dt: number): void;
  dispose(): void;
}

const GLOW_VERTEX: string = `
varying vec2 vUv;
varying float vFacing;
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vFacing = abs(dot(normalize(normalMatrix * normal), normalize(-mvPosition.xyz)));
  gl_Position = projectionMatrix * mvPosition;
}
`;

const POOL_FRAGMENT: string = `
uniform vec3 uColor;
uniform vec3 uCoreColor;
uniform float uOpacity;
uniform float uFalloff;
uniform float uCore;
varying vec2 vUv;
void main() {
  float r = clamp(length(vUv - 0.5) * 2.0, 0.0, 1.0);
  float glow = pow(1.0 - r, uFalloff);
  vec3 tone = mix(uColor, uCoreColor, pow(1.0 - r, uCore));
  gl_FragColor = vec4(tone * glow * uOpacity, 1.0);
}
`;

const COLUMN_FRAGMENT: string = `
uniform vec3 uColor;
uniform vec3 uCoreColor;
uniform float uOpacity;
uniform float uFalloff;
uniform float uCore;
varying vec2 vUv;
varying float vFacing;
void main() {
  float centre = 1.0 - clamp(abs(vUv.x - 0.5) * 2.0, 0.0, 1.0);
  float across = pow(centre, uFalloff);
  float up = smoothstep(0.0, 0.12, vUv.y) * pow(1.0 - vUv.y, 1.6);
  vec3 tone = mix(uColor, uCoreColor, pow(centre, uCore));
  gl_FragColor = vec4(tone * across * up * smoothstep(0.15, 0.6, vFacing) * uOpacity, 1.0);
}
`;

interface GlowUniforms {
  readonly uColor: IUniform<Color>;
  readonly uCoreColor: IUniform<Color>;
  readonly uCore: IUniform<number>;
  readonly uOpacity: IUniform<number>;
  readonly uFalloff: IUniform<number>;
}

function glowMaterial(fragmentShader: string, uniforms: GlowUniforms): ShaderMaterial {
  return new ShaderMaterial({ vertexShader: GLOW_VERTEX, fragmentShader, uniforms: { ...uniforms }, transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending });
}

function columnGeometry(): BufferGeometry {
  const planes: BufferGeometry[] = [0, Math.PI / 3, (Math.PI * 2) / 3].map((yaw: number): BufferGeometry => {
    const plane: PlaneGeometry = new PlaneGeometry(VOID_LIGHT.pillarWidth, VOID_LIGHT.pillarHeight, 1, 8);
    plane.rotateY(yaw);
    plane.translate(0, VOID_LIGHT.pillarHeight / 2, 0);
    return plane;
  });
  return mergeGeometries(planes);
}

function placedLight(world: World): ZoneExit | null {
  for (const met of world.zone.void?.encounters ?? []) {
    if (met.find.type !== 'exit') continue;
    const exitId: string = met.find.exit;
    const placed: boolean = world.encounters.some((state: EncounterState): boolean => state.id === met.id && state.pos !== null);
    const exit: ZoneExit | undefined = world.zone.exits.find((entry: ZoneExit): boolean => entry.id === exitId);
    if (placed && exit !== undefined && allHold(world, exit.requires)) return exit;
  }
  return null;
}

export function firelight(now: number): number {
  const [slow, fast] = VOID_LIGHT.flickerRates;
  const breathing: number = 1 - VOID_LIGHT.breathe + VOID_LIGHT.breathe * Math.sin(now * VOID_LIGHT.breatheRate);
  const flicker: number = 1 - VOID_LIGHT.flicker * (0.5 + 0.25 * Math.sin(now * slow) + 0.25 * Math.sin(now * fast + 1.3));
  return breathing * flicker;
}

export function createVoidLight(floor: number): VoidLight {
  const group: Group = new Group();
  const tint: Color = new Color(VOID_LIGHT.color);
  const core: Color = new Color(VOID_LIGHT.coreColor);
  const columnUniforms: GlowUniforms = { uColor: { value: tint }, uCoreColor: { value: core }, uCore: { value: VOID_LIGHT.pillarCore }, uOpacity: { value: 0 }, uFalloff: { value: VOID_LIGHT.pillarFalloff } };
  const poolUniforms: GlowUniforms = { uColor: { value: tint }, uCoreColor: { value: core }, uCore: { value: VOID_LIGHT.poolCore }, uOpacity: { value: 0 }, uFalloff: { value: VOID_LIGHT.glowFalloff } };
  const geometry: BufferGeometry = columnGeometry();
  const columnMaterial: ShaderMaterial = glowMaterial(COLUMN_FRAGMENT, columnUniforms);
  const column: Mesh = new Mesh(geometry, columnMaterial);
  column.renderOrder = VOID_LIGHT.renderOrder;
  const poolGeometry: PlaneGeometry = new PlaneGeometry(VOID_LIGHT.glowRadius * 2, VOID_LIGHT.glowRadius * 2);
  poolGeometry.rotateX(-Math.PI / 2);
  const poolMaterial: ShaderMaterial = glowMaterial(POOL_FRAGMENT, poolUniforms);
  const pool: Mesh = new Mesh(poolGeometry, poolMaterial);
  pool.position.y = floor + 0.02;
  pool.renderOrder = VOID_LIGHT.renderOrder;
  const fire: PointLight = new PointLight(tint, 0, VOID_LIGHT.fireDistance, VOID_LIGHT.fireDecay);
  fire.position.y = floor + VOID_LIGHT.fireHeight;
  group.add(column, pool, fire);
  column.visible = false;
  pool.visible = false;
  const uniform: IUniform<Vector3> = { value: new Vector3() };
  let strength: number = 0;

  return {
    group,
    uniform,
    update(world: World, now: number, dt: number): void {
      const exit: ZoneExit | null = placedLight(world);
      const wanted: number = exit === null ? 0 : 1;
      strength += (wanted - strength) * Math.min(1, dt * VOID_LIGHT.rise);
      if (exit !== null) {
        group.position.set(exit.x, floor, exit.z);
        uniform.value.set(exit.x, exit.z, strength);
      } else {
        uniform.value.z = strength;
      }
      const lit: number = strength * firelight(now);
      columnUniforms.uOpacity.value = VOID_LIGHT.pillarOpacity * lit;
      poolUniforms.uOpacity.value = VOID_LIGHT.glowOpacity * lit;
      column.visible = strength > 1e-3;
      pool.visible = column.visible;
      fire.intensity = VOID_LIGHT.fireIntensity * lit;
    },
    dispose(): void {
      group.removeFromParent();
      geometry.dispose();
      poolGeometry.dispose();
      columnMaterial.dispose();
      poolMaterial.dispose();
    },
  };
}
