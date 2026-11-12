import type { IUniform, Material, PerspectiveCamera, WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';
import { MeshStandardMaterial, Vector2, Vector3 } from 'three';

export const CUTAWAY = {
  radius: 0.13,
  feather: 0.55,
  margin: 0.8,
  depthFeather: 2.4,
  least: 0.18,
  heroHeight: 1,
  far: -1e5,
} as const;

export interface CutawayUniforms {
  readonly uCutCentre: IUniform<Vector2>;
  readonly uCutRadius: IUniform<number>;
  readonly uCutDepth: IUniform<number>;
}

export const CUTAWAY_UNIFORMS: CutawayUniforms = {
  uCutCentre: { value: new Vector2(CUTAWAY.far, CUTAWAY.far) },
  uCutRadius: { value: 1 },
  uCutDepth: { value: 0 },
};

export function cutawayChunk(): string {
  return [
    `float cutRing = 1.0 - smoothstep( uCutRadius * ${(1 - CUTAWAY.feather).toFixed(3)}, uCutRadius, distance( gl_FragCoord.xy, uCutCentre ) );`,
    `float cutFront = 1.0 - smoothstep( uCutDepth - ${(CUTAWAY.margin + CUTAWAY.depthFeather).toFixed(3)}, uCutDepth - ${CUTAWAY.margin.toFixed(3)}, vViewPosition.z );`,
    `gl_FragColor.a *= mix( 1.0, ${CUTAWAY.least.toFixed(3)}, cutRing * cutFront );`,
  ].join('\n');
}

const patched: WeakSet<Material> = new WeakSet<Material>();

export function patchCutawayShader(shader: Pick<WebGLProgramParametersWithUniforms, 'fragmentShader' | 'uniforms'>): void {
  shader.uniforms['uCutCentre'] = CUTAWAY_UNIFORMS.uCutCentre;
  shader.uniforms['uCutRadius'] = CUTAWAY_UNIFORMS.uCutRadius;
  shader.uniforms['uCutDepth'] = CUTAWAY_UNIFORMS.uCutDepth;
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', 'uniform vec2 uCutCentre;\nuniform float uCutRadius;\nuniform float uCutDepth;\nvoid main() {')
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
  material.transparent = true;
  material.forceSinglePass = true;
  return material;
}

const heroPoint: Vector3 = new Vector3();
const viewPoint: Vector3 = new Vector3();

export function aimCutaway(camera: PerspectiveCamera, heroX: number, heroZ: number, width: number, height: number): void {
  camera.updateMatrixWorld();
  heroPoint.set(heroX, CUTAWAY.heroHeight, heroZ);
  viewPoint.copy(heroPoint).applyMatrix4(camera.matrixWorldInverse);
  heroPoint.project(camera);
  CUTAWAY_UNIFORMS.uCutCentre.value.set((heroPoint.x * 0.5 + 0.5) * width, (heroPoint.y * 0.5 + 0.5) * height);
  CUTAWAY_UNIFORMS.uCutRadius.value = CUTAWAY.radius * height;
  CUTAWAY_UNIFORMS.uCutDepth.value = -viewPoint.z;
}
