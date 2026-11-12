import type { IUniform, MeshStandardMaterial, WebGLProgramParametersWithUniforms } from 'three';

export const PROP_SURFACE = {
  blendSharpness: 4,
  wetDarken: 0.75,
  wetRoughnessLow: 0.38,
  wetRoughnessHigh: 0.8,
  leastRoughness: 0.4,
  lumaRoughness: 2.5,
  puddleUp: 0.93,
  puddleFull: 0.99,
  puddleScale: 1.3,
  puddleFrom: 0.58,
  puddleTo: 0.68,
  puddleRoughness: 0.14,
  puddleDarken: 0.78,
  puddleFlatten: 0.9,
  streakScale: 7,
  streakStretch: 0.35,
  streakDarken: 0.82,
  topFrom: 0.35,
  topTo: 0.9,
  topLift: 1.2,
  edgeGain: 2.2,
  edgeLift: 0.55,
  edgeGloss: 0.55,
  contactHeight: 0.45,
  contactDarken: 0.45,
} as const;

export interface PropLook {
  readonly tileMetres: number | null;
  readonly wet: number;
  readonly ground: number;
}

export interface PropUniforms {
  readonly uPropTile: IUniform<number>;
  readonly uPropWet: IUniform<number>;
  readonly uPropGround: IUniform<number>;
  readonly [name: string]: IUniform<number>;
}

function glsl(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function propLookKey(look: PropLook): string {
  return look.tileMetres === null ? 'prop-look' : 'prop-look-triplanar';
}

export function propUniforms(look: PropLook): PropUniforms {
  return {
    uPropTile: { value: look.tileMetres === null || look.tileMetres <= 0 ? 1 : 1 / look.tileMetres },
    uPropWet: { value: clamp01(look.wet) },
    uPropGround: { value: look.ground },
  };
}

const VERTEX_HEAD: string = 'varying vec3 vPropWorld;\nvarying vec3 vPropNormal;';

const VERTEX_BODY: string = [
  'vec4 propWorld = vec4( transformed, 1.0 );',
  'vec3 propNormal = objectNormal;',
  '#ifdef USE_INSTANCING',
  '  propWorld = instanceMatrix * propWorld;',
  '  propNormal = mat3( instanceMatrix ) * propNormal;',
  '#endif',
  'propWorld = modelMatrix * propWorld;',
  'vPropWorld = propWorld.xyz;',
  'vPropNormal = normalize( mat3( modelMatrix ) * propNormal );',
].join('\n');

const FRAGMENT_HEAD: string = [
  'varying vec3 vPropWorld;',
  'varying vec3 vPropNormal;',
  'uniform float uPropTile;',
  'uniform float uPropWet;',
  'uniform float uPropGround;',
  'float propHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }',
  'float propNoise( vec2 p ) {',
  '  vec2 i = floor( p ); vec2 f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );',
  '  return mix( mix( propHash( i ), propHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( propHash( i + vec2( 0.0, 1.0 ) ), propHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );',
  '}',
  'vec3 propBlend() {',
  `  vec3 w = pow( abs( vPropNormal ), vec3( ${glsl(PROP_SURFACE.blendSharpness)} ) );`,
  '  return w / max( w.x + w.y + w.z, 1e-4 );',
  '}',
].join('\n');

function triplanarSample(sampler: string, out: string): string {
  return [
    `${out} = texture2D( ${sampler}, vPropWorld.zy * uPropTile ) * propW.x`,
    `  + texture2D( ${sampler}, vPropWorld.xz * uPropTile ) * propW.y`,
    `  + texture2D( ${sampler}, vPropWorld.xy * uPropTile ) * propW.z;`,
  ].join('\n');
}

const WET_TERMS: string = [
  `float propUp = smoothstep( ${glsl(PROP_SURFACE.puddleUp)}, ${glsl(PROP_SURFACE.puddleFull)}, normalize( vPropNormal ).y );`,
  `float propPuddle = smoothstep( ${glsl(PROP_SURFACE.puddleFrom)}, ${glsl(PROP_SURFACE.puddleTo)}, propNoise( vPropWorld.xz * ${glsl(PROP_SURFACE.puddleScale)} ) ) * propUp * uPropWet;`,
  `float propStreak = propNoise( vec2( ( vPropWorld.x + vPropWorld.z ) * ${glsl(PROP_SURFACE.streakScale)}, vPropWorld.y * ${glsl(PROP_SURFACE.streakStretch)} ) ) * ( 1.0 - propUp ) * uPropWet;`,
  `float propTop = smoothstep( ${glsl(PROP_SURFACE.topFrom)}, ${glsl(PROP_SURFACE.topTo)}, normalize( vPropNormal ).y );`,
  `float propEdge = clamp( length( fwidth( vPropNormal ) ) * ${glsl(PROP_SURFACE.edgeGain)}, 0.0, 1.0 );`,
  `float propContact = mix( ${glsl(PROP_SURFACE.contactDarken)}, 1.0, smoothstep( 0.0, ${glsl(PROP_SURFACE.contactHeight)}, vPropWorld.y - uPropGround ) );`,
].join('\n');

function mapChunk(triplanar: boolean): string {
  const sampled: string = triplanar ? [triplanarSample('map', 'vec4 propTexel'), `propRough = clamp( dot( propTexel.rgb, vec3( 0.333 ) ) * ${glsl(PROP_SURFACE.lumaRoughness)}, 0.0, 1.0 );`, 'diffuseColor *= propTexel;'].join('\n') : '#include <map_fragment>';
  const orm: string = triplanar ? ['#ifdef USE_AOMAP', triplanarSample('aoMap', 'propOrm'), '  propRough = propOrm.g;', '#endif'].join('\n') : '';
  return [
    'vec3 propW = propBlend();',
    'float propRough = 1.0;',
    'vec4 propOrm = vec4( 1.0 );',
    WET_TERMS,
    '#ifdef USE_MAP',
    sampled,
    '#endif',
    orm,
    `diffuseColor.rgb *= mix( 1.0, ${glsl(PROP_SURFACE.wetDarken)}, uPropWet ) * mix( 1.0, ${glsl(PROP_SURFACE.streakDarken)}, propStreak ) * mix( 1.0, ${glsl(PROP_SURFACE.puddleDarken)}, propPuddle ) * propContact * mix( 1.0, ${glsl(PROP_SURFACE.topLift)}, propTop * ( 1.0 - propPuddle ) ) * ( 1.0 + propEdge * ${glsl(PROP_SURFACE.edgeLift)} );`,
  ].join('\n');
}

const ROUGHNESS_CHUNK: string = [
  '#include <roughnessmap_fragment>',
  `roughnessFactor = mix( roughnessFactor, max( roughnessFactor * mix( ${glsl(PROP_SURFACE.wetRoughnessLow)}, ${glsl(PROP_SURFACE.wetRoughnessHigh)}, propRough ), ${glsl(PROP_SURFACE.leastRoughness)} ), uPropWet );`,
  `roughnessFactor = mix( roughnessFactor, max( roughnessFactor * ${glsl(PROP_SURFACE.edgeGloss)}, ${glsl(PROP_SURFACE.leastRoughness)} ), propEdge * propTop * uPropWet );`,
  `roughnessFactor = mix( roughnessFactor, ${glsl(PROP_SURFACE.puddleRoughness)}, propPuddle );`,
].join('\n');

const TRIPLANAR_NORMAL: string = [
  '#ifdef USE_NORMALMAP',
  '  vec3 propN = normalize( vPropNormal );',
  '  vec3 propSign = sign( propN );',
  '  vec3 tnX = texture2D( normalMap, vPropWorld.zy * uPropTile ).xyz * 2.0 - 1.0;',
  '  vec3 tnY = texture2D( normalMap, vPropWorld.xz * uPropTile ).xyz * 2.0 - 1.0;',
  '  vec3 tnZ = texture2D( normalMap, vPropWorld.xy * uPropTile ).xyz * 2.0 - 1.0;',
  '  tnX.xy *= normalScale; tnY.xy *= normalScale; tnZ.xy *= normalScale;',
  '  tnX.z *= propSign.x; tnY.z *= propSign.y; tnZ.z *= propSign.z;',
  '  tnX = vec3( tnX.xy + propN.zy, abs( tnX.z ) * propN.x );',
  '  tnY = vec3( tnY.xy + propN.xz, abs( tnY.z ) * propN.y );',
  '  tnZ = vec3( tnZ.xy + propN.xy, abs( tnZ.z ) * propN.z );',
  '  vec3 propWorldNormal = normalize( tnX.zyx * propW.x + tnY.xzy * propW.y + tnZ.xyz * propW.z );',
  '  normal = normalize( ( viewMatrix * vec4( propWorldNormal, 0.0 ) ).xyz ) * faceDirection;',
  '#endif',
].join('\n');

const FLATTEN: string = `normal = normalize( mix( normal, nonPerturbedNormal, propPuddle * ${glsl(PROP_SURFACE.puddleFlatten)} ) );`;

const TRIPLANAR_AO: string = ['#ifdef USE_AOMAP', '  reflectedLight.indirectDiffuse *= ( propOrm.r - 1.0 ) * aoMapIntensity + 1.0;', '#endif'].join('\n');

export interface ShaderSource {
  vertexShader: string;
  fragmentShader: string;
  readonly uniforms: Record<string, IUniform>;
}

export function patchPropShader(shader: ShaderSource, look: PropLook, uniforms: PropUniforms = propUniforms(look)): void {
  const triplanar: boolean = look.tileMetres !== null;
  for (const [name, uniform] of Object.entries(uniforms)) shader.uniforms[name] = uniform;
  shader.vertexShader = shader.vertexShader.replace('void main() {', `${VERTEX_HEAD}\nvoid main() {`).replace('#include <project_vertex>', `#include <project_vertex>\n${VERTEX_BODY}`);
  let fragment: string = shader.fragmentShader
    .replace('void main() {', `${FRAGMENT_HEAD}\nvoid main() {`)
    .replace('#include <map_fragment>', mapChunk(triplanar))
    .replace('#include <roughnessmap_fragment>', ROUGHNESS_CHUNK);
  fragment = triplanar ? fragment.replace('#include <normal_fragment_maps>', `${TRIPLANAR_NORMAL}\n${FLATTEN}`).replace('#include <aomap_fragment>', TRIPLANAR_AO) : fragment.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FLATTEN}`);
  shader.fragmentShader = fragment;
}

const looked: WeakMap<MeshStandardMaterial, PropLook> = new WeakMap<MeshStandardMaterial, PropLook>();

export function lookOf(material: MeshStandardMaterial): PropLook | undefined {
  return looked.get(material);
}

export function withPropLook(material: MeshStandardMaterial, look: PropLook): MeshStandardMaterial {
  looked.set(material, look);
  const uniforms: PropUniforms = propUniforms(look);
  const key: string = propLookKey(look);
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms): void => patchPropShader(shader, look, uniforms);
  material.customProgramCacheKey = (): string => key;
  return material;
}
