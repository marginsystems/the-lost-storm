import type { IUniform, MeshStandardMaterial } from 'three';
import { Color } from 'three';

export const GHOST = {
  programKey: 'storm-ghost',
  rimPower: 2.2,
  rimBoost: 1.8,
  hoverPower: 1.6,
  shadeFloor: 0.35,
  vanish: 0.004,
} as const;

export const FLASH = {
  boost: 0.6,
  core: 0.15,
  power: 1.5,
  lift: 0.45,
} as const;

export function flashEdge(facing: string, own: string): string {
  return `uFlash * ( ${FLASH.core.toFixed(2)} + ${(1 - FLASH.core).toFixed(2)} * pow( ${facing}, ${FLASH.power.toFixed(2)} ) ) + ${own} * uFlashLift`;
}

export function flashLift(amount: number): number {
  return amount * amount * amount * FLASH.lift;
}

export interface GhostUniforms {
  readonly tint: IUniform<Color>;
  readonly mix: IUniform<number>;
  readonly rim: IUniform<number>;
  readonly dissolve: IUniform<number>;
}

export interface RigGlow {
  readonly flash: IUniform<Color>;
  readonly lift: IUniform<number>;
  readonly hover: IUniform<Color>;
}

export function createRigGlow(): RigGlow {
  return { flash: { value: new Color(0, 0, 0) }, lift: { value: 0 }, hover: { value: new Color(0, 0, 0) } };
}

export function createGhostUniforms(tint: Color, mix: number): GhostUniforms {
  return { tint: { value: tint.clone() }, mix: { value: mix }, rim: { value: 1 }, dissolve: { value: 0 } };
}

const DECLARE: string = ['uniform vec3 uFlash;', 'uniform float uFlashLift;', 'uniform vec3 uHover;', 'uniform vec3 uGhostTint;', 'uniform float uGhostMix;', 'uniform float uGhostRim;', 'uniform float uGhostDissolve;', 'void main() {'].join('\n');

export const GHOST_SHADE: string = [
  '#include <emissivemap_fragment>',
  'float ghostLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));',
  `diffuseColor.rgb = mix(diffuseColor.rgb, uGhostTint * (${GHOST.shadeFloor.toFixed(2)} + ghostLuma), uGhostMix);`,
  'float ghostFacing = clamp(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);',
  `totalEmissiveRadiance += ${flashEdge('ghostFacing', 'uGhostTint')} + uHover * pow(ghostFacing, ${GHOST.hoverPower.toFixed(2)}) + uGhostTint * pow(ghostFacing, ${GHOST.rimPower.toFixed(2)}) * ${GHOST.rimBoost.toFixed(2)} * uGhostRim;`,
  'diffuseColor.a *= clamp(1.0 - uGhostDissolve, 0.0, 1.0);',
  `if (diffuseColor.a < ${GHOST.vanish.toFixed(3)}) discard;`,
].join('\n');

export function makeGhost(material: MeshStandardMaterial, glow: RigGlow, ghost: GhostUniforms): void {
  material.transparent = true;
  material.forceSinglePass = true;
  material.depthWrite = true;
  material.onBeforeCompile = (shader): void => {
    shader.uniforms['uFlash'] = glow.flash;
    shader.uniforms['uFlashLift'] = glow.lift;
    shader.uniforms['uHover'] = glow.hover;
    shader.uniforms['uGhostTint'] = ghost.tint;
    shader.uniforms['uGhostMix'] = ghost.mix;
    shader.uniforms['uGhostRim'] = ghost.rim;
    shader.uniforms['uGhostDissolve'] = ghost.dissolve;
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', DECLARE).replace('#include <emissivemap_fragment>', GHOST_SHADE);
  };
  material.customProgramCacheKey = (): string => GHOST.programKey;
}
