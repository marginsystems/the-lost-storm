import type { MeshStandardMaterial, WebGLProgramParametersWithUniforms } from 'three';
import { ShaderChunk } from 'three';

export const WET_GROUND = {
  breakScale: 0.11,
  breakTurn: 0.71,
  breakStretch: 0.77,
  breakShift: 0.37,
  breakSharpness: 0.35,
  puddleScale: 0.16,
  puddleFrom: 0.58,
  puddleTo: 0.74,
  puddleGloss: 0.1,
  puddleDarken: 0.62,
  puddleFlatten: 0.85,
  crackFrom: 0.45,
  crackTo: 0.85,
  crackBlur: 4,
  crackDarken: 0.7,
  crackGloss: 0.55,
  roughSpread: 0.18,
  roughScale: 0.37,
} as const;

function glsl(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`;
}

export function clampedWet(wet: number): number {
  return Math.round(Math.min(1, Math.max(0, wet)) * 100) / 100;
}

export function wetGroundKey(wet: number): string {
  return `storm-ground-${clampedWet(wet)}`;
}

const NOISE: string = [
  'varying vec2 vGroundXZ;',
  'float groundHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }',
  'float groundNoise( vec2 p ) {',
  '  vec2 i = floor( p ); vec2 f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );',
  '  return mix( mix( groundHash( i ), groundHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( groundHash( i + vec2( 0.0, 1.0 ) ), groundHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );',
  '}',
  'float groundFbm( vec2 p ) { return groundNoise( p ) * 0.62 + groundNoise( p * 2.13 + 17.1 ) * 0.38; }',
].join('\n');

export interface WetGroundParts {
  readonly head: string;
  readonly map: string;
  readonly roughness: string;
  readonly normal: string;
  readonly normalAfter: string;
}

export function wetGroundFragment(wet: number): WetGroundParts {
  const amount: string = glsl(clampedWet(wet));
  const c: number = Math.cos(WET_GROUND.breakTurn);
  const s: number = Math.sin(WET_GROUND.breakTurn);
  const turn: string = `mat2( ${glsl(c)}, ${glsl(s)}, ${glsl(-s)}, ${glsl(c)} )`;
  return {
    head: `${NOISE}\nvec2 groundTurned( vec2 uv ) { return ${turn} * uv * ${glsl(WET_GROUND.breakStretch)} + vec2( ${glsl(WET_GROUND.breakShift)} ); }`,
    map: [
      `float groundBreak = smoothstep( 0.5 - ${glsl(WET_GROUND.breakSharpness)}, 0.5 + ${glsl(WET_GROUND.breakSharpness)}, groundFbm( vGroundXZ * ${glsl(WET_GROUND.breakScale)} ) );`,
      `float groundPuddle = smoothstep( ${glsl(WET_GROUND.puddleFrom)}, ${glsl(WET_GROUND.puddleTo)}, groundFbm( vGroundXZ * ${glsl(WET_GROUND.puddleScale)} + 41.3 ) ) * ${amount};`,
      'float groundCrack = 0.0;',
      '#ifdef USE_MAP',
      '  vec4 groundA = texture2D( map, vMapUv );',
      '  vec4 groundB = texture2D( map, groundTurned( vMapUv ) );',
      '  vec4 groundTexel = mix( groundA, groundB, groundBreak );',
      `  vec4 groundMean = texture2D( map, vMapUv, ${glsl(WET_GROUND.crackBlur)} );`,
      `  groundCrack = ( 1.0 - smoothstep( ${glsl(WET_GROUND.crackFrom)}, ${glsl(WET_GROUND.crackTo)}, dot( groundTexel.rgb, vec3( 0.333 ) ) / max( dot( groundMean.rgb, vec3( 0.333 ) ), 0.02 ) ) ) * ${amount};`,
      '  diffuseColor *= groundTexel;',
      '#endif',
      `diffuseColor.rgb *= mix( 1.0, ${glsl(WET_GROUND.crackDarken)}, groundCrack ) * mix( 1.0, ${glsl(WET_GROUND.puddleDarken)}, groundPuddle );`,
    ].join('\n'),
    roughness: [
      `roughnessFactor *= 1.0 + ( groundNoise( vGroundXZ * ${glsl(WET_GROUND.roughScale)} + 7.7 ) - 0.5 ) * ${glsl(WET_GROUND.roughSpread * 2)};`,
      `roughnessFactor = mix( roughnessFactor, roughnessFactor * ${glsl(WET_GROUND.crackGloss)}, groundCrack );`,
      `roughnessFactor = mix( roughnessFactor, ${glsl(WET_GROUND.puddleGloss)}, groundPuddle );`,
    ].join('\n'),
    normal: 'vec3 mapN = mix( texture2D( normalMap, vNormalMapUv ).xyz, texture2D( normalMap, groundTurned( vNormalMapUv ) ).xyz, groundBreak ) * 2.0 - 1.0;',
    normalAfter: `normal = normalize( mix( normal, nonPerturbedNormal, groundPuddle * ${glsl(WET_GROUND.puddleFlatten)} ) );`,
  };
}

const PLAIN_NORMAL: string = 'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;';

export function patchGroundShader(shader: Pick<WebGLProgramParametersWithUniforms, 'vertexShader' | 'fragmentShader'>, wet: number): void {
  const parts: WetGroundParts = wetGroundFragment(wet);
  const normalMaps: string = ShaderChunk.normal_fragment_maps.replace(PLAIN_NORMAL, parts.normal);
  shader.vertexShader = shader.vertexShader.replace('void main() {', 'varying vec2 vGroundXZ;\nvoid main() {\n  vGroundXZ = uv;');
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', `${parts.head}\nvoid main() {`)
    .replace('#include <map_fragment>', parts.map)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${parts.roughness}`)
    .replace('#include <normal_fragment_maps>', `${normalMaps}\n${parts.normalAfter}`);
}

export function wetGround(material: MeshStandardMaterial, wet: number): void {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms): void => patchGroundShader(shader, wet);
  material.customProgramCacheKey = (): string => wetGroundKey(wet);
}
