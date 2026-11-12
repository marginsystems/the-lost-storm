import type { Color, IUniform, MeshStandardMaterial } from 'three';

export const GHOST = {
  programKey: 'storm-ghost',
  rimPower: 2.2,
  rimBoost: 1.8,
  shadeFloor: 0.35,
  vanish: 0.004,
} as const;

export interface GhostUniforms {
  readonly tint: IUniform<Color>;
  readonly mix: IUniform<number>;
  readonly rim: IUniform<number>;
  readonly dissolve: IUniform<number>;
}

export function createGhostUniforms(tint: Color, mix: number): GhostUniforms {
  return { tint: { value: tint.clone() }, mix: { value: mix }, rim: { value: 1 }, dissolve: { value: 0 } };
}

const DECLARE: string = ['uniform vec3 uFlash;', 'uniform vec3 uGhostTint;', 'uniform float uGhostMix;', 'uniform float uGhostRim;', 'uniform float uGhostDissolve;', 'void main() {'].join('\n');

export const GHOST_SHADE: string = [
  '#include <emissivemap_fragment>',
  'float ghostLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));',
  `diffuseColor.rgb = mix(diffuseColor.rgb, uGhostTint * (${GHOST.shadeFloor.toFixed(2)} + ghostLuma), uGhostMix);`,
  'float ghostFacing = clamp(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);',
  `totalEmissiveRadiance += uFlash + uGhostTint * pow(ghostFacing, ${GHOST.rimPower.toFixed(2)}) * ${GHOST.rimBoost.toFixed(2)} * uGhostRim;`,
  'diffuseColor.a *= clamp(1.0 - uGhostDissolve, 0.0, 1.0);',
  `if (diffuseColor.a < ${GHOST.vanish.toFixed(3)}) discard;`,
].join('\n');

export function makeGhost(material: MeshStandardMaterial, flash: IUniform<Color>, ghost: GhostUniforms): void {
  material.transparent = true;
  material.depthWrite = true;
  material.onBeforeCompile = (shader): void => {
    shader.uniforms['uFlash'] = flash;
    shader.uniforms['uGhostTint'] = ghost.tint;
    shader.uniforms['uGhostMix'] = ghost.mix;
    shader.uniforms['uGhostRim'] = ghost.rim;
    shader.uniforms['uGhostDissolve'] = ghost.dissolve;
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', DECLARE).replace('#include <emissivemap_fragment>', GHOST_SHADE);
  };
  material.customProgramCacheKey = (): string => GHOST.programKey;
}
