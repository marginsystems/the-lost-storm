import type { IUniform, MeshStandardMaterial } from 'three';
import { Color, Vector3 } from 'three';

export const GHOST = {
  programKey: 'storm-ghost',
  rimPower: 2.2,
  rimBoost: 1.8,
  hoverPower: 1.6,
  shadeFloor: 0.35,
  vanish: 0.004,
} as const;

export const RIM_EDGE = {
  jag: 0.22,
  fade: 0.16,
  inset: 0.35,
  waves: [
    { weight: 0.5, frequency: 3, phase: 1 },
    { weight: 0.3, frequency: 7, phase: 2 },
    { weight: 0.2, frequency: 13, phase: 3 },
  ],
} as const;

export function rimEdge(angle: number, seed: number): number {
  const wobble: number = RIM_EDGE.waves.reduce((sum: number, wave): number => sum + wave.weight * Math.sin(wave.frequency * angle + wave.phase * seed), 0);
  return 1 - RIM_EDGE.jag * (0.5 + 0.5 * wobble);
}

export function rimShown(reach: number, angle: number, seed: number): number {
  const inside: number = Math.min(1, Math.max(0, (rimEdge(angle, seed) - reach) / RIM_EDGE.fade - RIM_EDGE.inset));
  return inside * inside * (3 - 2 * inside);
}

export function rimPhases(seed: number): Vector3 {
  const turn: number = Math.PI * 2;
  const [first, second, third] = RIM_EDGE.waves;
  return new Vector3((first.phase * seed) % turn, (second.phase * seed) % turn, (third.phase * seed) % turn);
}

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
  readonly bound: IUniform<Vector3>;
  readonly phases: IUniform<Vector3>;
}

export interface RigGlow {
  readonly flash: IUniform<Color>;
  readonly lift: IUniform<number>;
  readonly hover: IUniform<Color>;
  readonly shade: IUniform<Color>;
  readonly shadeMix: IUniform<number>;
  readonly shadeWet: IUniform<number>;
  readonly rankRim: IUniform<Color>;
}

export function createRigGlow(): RigGlow {
  return { flash: { value: new Color(0, 0, 0) }, lift: { value: 0 }, hover: { value: new Color(0, 0, 0) }, shade: { value: new Color(0, 0, 0) }, shadeMix: { value: 0 }, shadeWet: { value: 0 }, rankRim: { value: new Color(0, 0, 0) } };
}

export function createGhostUniforms(tint: Color, mix: number): GhostUniforms {
  return { tint: { value: tint.clone() }, mix: { value: mix }, rim: { value: 1 }, dissolve: { value: 0 }, bound: { value: new Vector3() }, phases: { value: new Vector3() } };
}

const DECLARE: string = ['uniform vec3 uFlash;', 'uniform float uFlashLift;', 'uniform vec3 uHover;', 'uniform vec3 uGhostTint;', 'uniform float uGhostMix;', 'uniform float uGhostRim;', 'uniform float uGhostDissolve;', 'uniform vec3 uGhostBound;', 'uniform vec3 uGhostPhases;', 'varying vec3 vGhostWorld;', 'void main() {'].join('\n');

const [EDGE_ONE, EDGE_TWO, EDGE_THREE] = RIM_EDGE.waves;

function waveTerm(term: { readonly weight: number; readonly frequency: number }, phase: string): string {
  return `${term.weight.toFixed(2)} * sin(${term.frequency.toFixed(1)} * ghostAngle + ${phase})`;
}

export const GHOST_BOUND: string = [
  'if (uGhostBound.z > 0.0) {',
  '  vec2 ghostOffset = vGhostWorld.xz - uGhostBound.xy;',
  '  float ghostReach = length(ghostOffset) / uGhostBound.z;',
  '  float ghostAngle = atan(ghostOffset.y, ghostOffset.x);',
  `  float ghostWobble = ${waveTerm(EDGE_ONE, 'uGhostPhases.x')} + ${waveTerm(EDGE_TWO, 'uGhostPhases.y')} + ${waveTerm(EDGE_THREE, 'uGhostPhases.z')};`,
  `  float ghostEdge = 1.0 - ${RIM_EDGE.jag.toFixed(2)} * (0.5 + 0.5 * ghostWobble);`,
  `  diffuseColor.a *= smoothstep(0.0, 1.0, clamp((ghostEdge - ghostReach) / ${RIM_EDGE.fade.toFixed(2)} - ${RIM_EDGE.inset.toFixed(2)}, 0.0, 1.0));`,
  '}',
].join('\n');

const WORLD_VARYING: string = 'varying vec3 vGhostWorld;\nvoid main() {';
const WORLD_POSITION: string = '#include <project_vertex>\nvGhostWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;';

export function ghostVertex(source: string): string {
  return source.replace('void main() {', WORLD_VARYING).replace('#include <project_vertex>', WORLD_POSITION);
}

export const GHOST_SHADE: string = [
  '#include <emissivemap_fragment>',
  'float ghostLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));',
  `diffuseColor.rgb = mix(diffuseColor.rgb, uGhostTint * (${GHOST.shadeFloor.toFixed(2)} + ghostLuma), uGhostMix);`,
  'float ghostFacing = clamp(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);',
  `totalEmissiveRadiance += ${flashEdge('ghostFacing', 'uGhostTint')} + uHover * pow(ghostFacing, ${GHOST.hoverPower.toFixed(2)}) + uGhostTint * pow(ghostFacing, ${GHOST.rimPower.toFixed(2)}) * ${GHOST.rimBoost.toFixed(2)} * uGhostRim;`,
  'diffuseColor.a *= clamp(1.0 - uGhostDissolve, 0.0, 1.0);',
  GHOST_BOUND,
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
    shader.uniforms['uGhostBound'] = ghost.bound;
    shader.uniforms['uGhostPhases'] = ghost.phases;
    shader.vertexShader = ghostVertex(shader.vertexShader);
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', DECLARE).replace('#include <emissivemap_fragment>', GHOST_SHADE);
  };
  material.customProgramCacheKey = (): string => GHOST.programKey;
}
