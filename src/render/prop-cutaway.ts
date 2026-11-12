import type { IUniform, Material, PerspectiveCamera, WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';
import type { Object3D } from 'three';
import { Matrix4, MeshStandardMaterial, Raycaster, Vector2, Vector3 } from 'three';
import type { ReadonlyVec2 } from '../../sim/math.ts';

export const CUTAWAY = {
  radius: 0.075,
  narrow: 1.5,
  deepest: 0.9,
  waist: 0.95,
  waistFeather: 0.45,
  feather: 0.85,
  margin: 0.6,
  depthFeather: 1.2,
  heroHeight: 1,
  far: -1e5,
  tallFrom: 1.5,
  chest: 1.3,
  head: 1.75,
  stiffness: 90,
  damping: 18,
  rest: 0.002,
  longestStep: 1 / 30,
  ditherLift: 0.03,
} as const;

export interface CutawayUniforms {
  readonly uCutCentre: IUniform<Vector2>;
  readonly uCutRadius: IUniform<number>;
  readonly uCutDepth: IUniform<number>;
  readonly uCutLevel: IUniform<number>;
  readonly uCutWorld: IUniform<Matrix4>;
}

export const CUTAWAY_UNIFORMS: CutawayUniforms = {
  uCutCentre: { value: new Vector2(CUTAWAY.far, CUTAWAY.far) },
  uCutRadius: { value: 1 },
  uCutDepth: { value: 0 },
  uCutLevel: { value: 0 },
  uCutWorld: { value: new Matrix4() },
};

export interface CutSpring {
  readonly level: number;
  readonly velocity: number;
}

const probe: Raycaster = new Raycaster();
const probeFrom: Vector3 = new Vector3();
const probeTo: Vector3 = new Vector3();

function shown(object: Object3D): boolean {
  for (let node: Object3D | null = object; node !== null; node = node.parent) if (!node.visible) return false;
  return true;
}

export function heroBehind(hero: ReadonlyVec2, eye: Vector3, list: readonly Object3D[]): boolean {
  const seen: Object3D[] = list.filter(shown);
  if (seen.length === 0) return false;
  for (const lift of [CUTAWAY.chest, CUTAWAY.head]) {
    probeFrom.set(hero.x, lift, hero.z);
    probeTo.copy(eye).sub(probeFrom);
    const far: number = probeTo.length();
    if (far <= 0) continue;
    probe.set(probeFrom, probeTo.divideScalar(far));
    probe.far = far;
    if (probe.intersectObjects(seen, false).length > 0) return true;
  }
  return false;
}

export function springCut(state: CutSpring, target: number, dt: number): CutSpring {
  const step: number = Math.min(Math.max(0, dt), CUTAWAY.longestStep);
  const velocity: number = state.velocity + ((target - state.level) * CUTAWAY.stiffness - state.velocity * CUTAWAY.damping) * step;
  const level: number = Math.min(1, Math.max(0, state.level + velocity * step));
  if (target === 0 && level < CUTAWAY.rest) return { level: 0, velocity: 0 };
  return { level, velocity };
}

export function cutawayChunk(): string {
  return [
    `float cutRing = 1.0 - smoothstep( uCutRadius * ${(1 - CUTAWAY.feather).toFixed(3)}, uCutRadius, length( ( gl_FragCoord.xy - uCutCentre ) * vec2( ${CUTAWAY.narrow.toFixed(3)}, 1.0 ) ) );`,
    `float cutFront = 1.0 - smoothstep( uCutDepth - ${(CUTAWAY.margin + CUTAWAY.depthFeather).toFixed(3)}, uCutDepth - ${CUTAWAY.margin.toFixed(3)}, vViewPosition.z );`,
    `float cutHigh = smoothstep( ${CUTAWAY.waist.toFixed(3)}, ${(CUTAWAY.waist + CUTAWAY.waistFeather).toFixed(3)}, ( uCutWorld * vec4( -vViewPosition, 1.0 ) ).y );`,
    'vec2 cutCell = floor( gl_FragCoord.xy );',
    'float cutHalf = fract( dot( floor( cutCell * 0.5 ), vec2( 0.5, floor( cutCell.y * 0.5 ) * 0.75 ) ) );',
    'float cutWhole = fract( dot( cutCell, vec2( 0.5, cutCell.y * 0.75 ) ) );',
    'float cutDither = cutHalf * 0.25 + cutWhole;',
    `if ( cutRing * cutFront * cutHigh * uCutLevel * ${CUTAWAY.deepest.toFixed(3)} > cutDither + ${CUTAWAY.ditherLift.toFixed(3)} ) discard;`,
  ].join('\n');
}

const patched: WeakSet<Material> = new WeakSet<Material>();

export function patchCutawayShader(shader: Pick<WebGLProgramParametersWithUniforms, 'fragmentShader' | 'uniforms'>): void {
  shader.uniforms['uCutCentre'] = CUTAWAY_UNIFORMS.uCutCentre;
  shader.uniforms['uCutRadius'] = CUTAWAY_UNIFORMS.uCutRadius;
  shader.uniforms['uCutDepth'] = CUTAWAY_UNIFORMS.uCutDepth;
  shader.uniforms['uCutLevel'] = CUTAWAY_UNIFORMS.uCutLevel;
  shader.uniforms['uCutWorld'] = CUTAWAY_UNIFORMS.uCutWorld;
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', 'uniform vec2 uCutCentre;\nuniform float uCutRadius;\nuniform float uCutDepth;\nuniform float uCutLevel;\nuniform mat4 uCutWorld;\nvoid main() {')
    .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${cutawayChunk()}`);
}

export function withCutaway(material: Material): Material {
  if (!(material instanceof MeshStandardMaterial) || patched.has(material)) return material;
  patched.add(material);
  const before: MeshStandardMaterial['onBeforeCompile'] = material.onBeforeCompile.bind(material);
  const key: string = material.customProgramCacheKey();
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer): void => {
    before(shader, renderer);
    patchCutawayShader(shader);
  };
  material.customProgramCacheKey = (): string => `${key}|cutaway`;
  return material;
}

export function isTall(height: number): boolean {
  return height >= CUTAWAY.tallFrom;
}

const heroPoint: Vector3 = new Vector3();
const viewPoint: Vector3 = new Vector3();
const eye: Vector3 = new Vector3();
let occluders: readonly Object3D[] = [];
let spring: CutSpring = { level: 0, velocity: 0 };

export function setOccluders(list: readonly Object3D[]): void {
  occluders = list;
}

export function aimCutaway(camera: PerspectiveCamera, heroX: number, heroZ: number, width: number, height: number, dt: number): void {
  camera.updateMatrixWorld();
  camera.getWorldPosition(eye);
  CUTAWAY_UNIFORMS.uCutWorld.value.copy(camera.matrixWorld);
  spring = springCut(spring, heroBehind({ x: heroX, z: heroZ }, eye, occluders) ? 1 : 0, dt);
  CUTAWAY_UNIFORMS.uCutLevel.value = spring.level;
  heroPoint.set(heroX, CUTAWAY.heroHeight, heroZ);
  viewPoint.copy(heroPoint).applyMatrix4(camera.matrixWorldInverse);
  heroPoint.project(camera);
  CUTAWAY_UNIFORMS.uCutCentre.value.set((heroPoint.x * 0.5 + 0.5) * width, (heroPoint.y * 0.5 + 0.5) * height);
  CUTAWAY_UNIFORMS.uCutRadius.value = CUTAWAY.radius * height;
  CUTAWAY_UNIFORMS.uCutDepth.value = -viewPoint.z;
}
