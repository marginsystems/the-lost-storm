import type { IUniform, Texture, WebGLProgramParametersWithUniforms } from 'three';
import { Color, DataTexture, MeshStandardMaterial, RGBAFormat, ShaderChunk, UnsignedByteType } from 'three';
import type { SurfaceGlow } from '../../sim/content/types.ts';
import { FLOOR_STACK } from './floor-stack.ts';
import { GLOW_CLOCK, GLOW_HELPERS, glowFragment, glowKey } from './surface-glow.ts';
import { clampedWet, GROUND_EDGE, WET_GROUND, wetGroundFragment } from './wet-ground.ts';
import type { WetGroundParts } from './wet-ground.ts';

export const FLOOR_MATERIAL = {
  least: 0.004,
  solidFrom: 0.999,
  greyWeight: 0.333,
  greyLeast: 0.02,
} as const;

export interface FloorLayerLook {
  readonly tint: string;
  readonly roughness: number;
  readonly normalScale: number;
  readonly scale: number;
  readonly glow: SurfaceGlow | null;
}

export interface FloorLayout {
  readonly layers: readonly FloorLayerLook[];
  readonly fringes: readonly number[];
  readonly blends: readonly number[];
  readonly fringeOrder: readonly number[];
  readonly blendOrder: readonly number[];
  readonly wet: number;
}

export interface FloorMaterial {
  readonly material: MeshStandardMaterial;
  useArrays(colour: Texture, detail: Texture): void;
}

function glsl(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`;
}

function onePixel(r: number, g: number, b: number): DataTexture {
  const texture: DataTexture = new DataTexture(new Uint8Array([r, g, b, 255]), 1, 1, RGBAFormat, UnsignedByteType);
  texture.needsUpdate = true;
  return texture;
}

const FLAT_NORMAL: DataTexture = onePixel(128, 128, 255);
const FULL_LIGHT: DataTexture = onePixel(255, 255, 255);

export function glowLayerFunction(index: number, glow: SurfaceGlow): string {
  const body: string = glowFragment(glow)
    .replaceAll('#ifdef USE_MAP', '#if 1')
    .replace(/texture2D\( map, ([A-Za-z_]\w*), ([^()]+?) \)/g, 'floorMapBias( $1, layerId, $2 )')
    .replace(/texture2D\( map, ([A-Za-z_]\w*) \)/g, 'floorMap( $1, layerId )')
    .replaceAll('vMapUv', 'layerUv')
    .replaceAll('diffuseColor.rgb *=', 'albedo *=')
    .replaceAll('totalEmissiveRadiance +=', 'glow +=');
  return `void floorGlow${index}( vec2 layerUv, float layerId, float groundShare, float groundCut, inout vec3 albedo, inout vec3 glow ) {\n${body}\n}`;
}

function glowDispatch(layout: FloorLayout): string {
  return layout.layers
    .map((layer: FloorLayerLook, index: number): string => (layer.glow === null ? '' : `  if ( layer == ${index} ) floorGlow${index}( layerUv, id, share, cut, albedo, glow );`))
    .filter((line: string): boolean => line !== '')
    .join('\n');
}

function slotMix(name: string, count: number, low: string, high: string, layers: string, order: string): string {
  return [
    `for ( int step = 0; step < ${count}; step ++ ) {`,
    `  int slot = int( ${order}[ step ] + 0.5 );`,
    `  float weight = slot < ${FLOOR_STACK.lanes} ? ${low}[ slot ] : ${high}[ slot - ${FLOOR_STACK.lanes} ];`,
    `  if ( weight <= ${glsl(FLOOR_MATERIAL.least)} ) continue;`,
    `  bool part = weight < ${glsl(FLOOR_MATERIAL.solidFrom)};`,
    '  float share = part ? weight : 1.0;',
    '  float cut = part ? floorCut : 0.0;',
    `  float cover = part ? weight * smoothstep( cut - ${glsl(GROUND_EDGE.soft)}, cut + ${glsl(GROUND_EDGE.soft)}, share ) : 1.0;`,
    `  FloorLayer ${name} = floorLayer( ${layers}[ slot ], share, cut );`,
    `  floorAlbedo = mix( floorAlbedo, ${name}.albedo, cover );`,
    `  floorRough = mix( floorRough, ${name}.rough, cover );`,
    `  floorAo = mix( floorAo, ${name}.ao, cover );`,
    `  floorNormal = mix( floorNormal, ${name}.normal, cover );`,
    `  floorGlow = mix( floorGlow, ${name}.glow, cover );`,
    '}',
  ].join('\n');
}

export function floorHead(layout: FloorLayout, parts: WetGroundParts): string {
  const w = WET_GROUND;
  const wet: string = glsl(clampedWet(layout.wet));
  const most: number = FLOOR_STACK.most;
  const slots: number = FLOOR_STACK.slots;
  const glows: string = layout.layers.map((layer: FloorLayerLook, index: number): string => (layer.glow === null ? '' : glowLayerFunction(index, layer.glow))).join('\n');
  return [
    parts.head,
    'uniform mediump sampler2DArray uFloorColour;',
    'uniform mediump sampler2DArray uFloorDetail;',
    `uniform float uLayerScale[ ${most} ];`,
    `uniform vec3 uLayerTint[ ${most} ];`,
    `uniform float uLayerRough[ ${most} ];`,
    `uniform float uLayerNormal[ ${most} ];`,
    `uniform float uFringeLayer[ ${slots} ];`,
    `uniform float uBlendLayer[ ${slots} ];`,
    `uniform float uFringeOrder[ ${slots} ];`,
    `uniform float uBlendOrder[ ${slots} ];`,
    'uniform float uGlowTime;',
    'flat varying float vFloorSolid;',
    'varying float vFloorShade;',
    'varying vec4 vFringeLow;',
    'varying vec4 vFringeHigh;',
    'varying vec4 vBlendLow;',
    'varying vec4 vBlendHigh;',
    'float groundBreak;',
    'float groundPuddle;',
    'float groundWobble;',
    'vec4 floorMap( vec2 uv, float id ) { return texture( uFloorColour, vec3( uv, id ) ); }',
    'vec4 floorMapBias( vec2 uv, float id, float bias ) { return texture( uFloorColour, vec3( uv, id ), bias ); }',
    GLOW_HELPERS,
    glows,
    'struct FloorLayer { vec3 albedo; float rough; float ao; vec3 normal; vec3 glow; };',
    'FloorLayer floorLayer( float id, float share, float cut ) {',
    '  int layer = int( id + 0.5 );',
    '  vec2 layerUv = vGroundXZ * uLayerScale[ layer ];',
    '  vec2 turnedUv = groundTurned( layerUv );',
    '  vec4 texel = mix( floorMap( layerUv, id ), floorMap( turnedUv, id ), groundBreak );',
    `  vec4 mean = floorMapBias( layerUv, id, ${glsl(w.crackBlur)} );`,
    `  float crack = ( 1.0 - smoothstep( ${glsl(w.crackFrom)}, ${glsl(w.crackTo)}, dot( texel.rgb, vec3( ${glsl(FLOOR_MATERIAL.greyWeight)} ) ) / max( dot( mean.rgb, vec3( ${glsl(FLOOR_MATERIAL.greyWeight)} ) ), ${glsl(FLOOR_MATERIAL.greyLeast)} ) ) ) * ${wet};`,
    `  vec3 albedo = uLayerTint[ layer ] * texel.rgb * mix( 1.0, ${glsl(w.crackDarken)}, crack ) * mix( 1.0, ${glsl(w.puddleDarken)}, groundPuddle );`,
    '  float rough = uLayerRough[ layer ] * groundWobble;',
    `  rough = mix( rough, rough * ${glsl(w.crackGloss)}, crack );`,
    `  rough = mix( rough, ${glsl(w.puddleGloss)}, groundPuddle );`,
    '  vec4 plain = texture( uFloorDetail, vec3( layerUv, id ) );',
    '  vec2 tilt = mix( plain.rg, texture( uFloorDetail, vec3( turnedUv, id ) ).rg, groundBreak ) * 2.0 - 1.0;',
    '  vec3 normal = vec3( tilt * uLayerNormal[ layer ], sqrt( max( 0.0, 1.0 - dot( tilt, tilt ) ) ) );',
    '  vec3 glow = vec3( 0.0 );',
    glowDispatch(layout),
    '  return FloorLayer( albedo, rough, plain.b, normal, glow );',
    '}',
  ].join('\n');
}

export function floorBody(layout: FloorLayout): string {
  const w = WET_GROUND;
  const e = GROUND_EDGE;
  const wet: string = glsl(clampedWet(layout.wet));
  return [
    `groundBreak = smoothstep( 0.5 - ${glsl(w.breakSharpness)}, 0.5 + ${glsl(w.breakSharpness)}, groundFbm( vGroundXZ * ${glsl(w.breakScale)} ) );`,
    `groundPuddle = smoothstep( ${glsl(w.puddleFrom)}, ${glsl(w.puddleTo)}, groundFbm( vGroundXZ * ${glsl(w.puddleScale)} + 41.3 ) ) * ${wet};`,
    `groundWobble = 1.0 + ( groundNoise( vGroundXZ * ${glsl(w.roughScale)} + 7.7 ) - 0.5 ) * ${glsl(w.roughSpread * 2)};`,
    `float floorCut = mix( ${glsl(e.low)}, ${glsl(e.high)}, groundFbm( vGroundXZ * ${glsl(e.scale)} + 3.7 ) );`,
    'FloorLayer floorBase = floorLayer( vFloorSolid, 1.0, 0.0 );',
    'vec3 floorAlbedo = floorBase.albedo;',
    'float floorRough = floorBase.rough;',
    'float floorAo = floorBase.ao;',
    'vec3 floorNormal = floorBase.normal;',
    'vec3 floorGlow = floorBase.glow;',
    slotMix('floorFringe', layout.fringeOrder.length, 'vFringeLow', 'vFringeHigh', 'uFringeLayer', 'uFringeOrder'),
    slotMix('floorBlend', layout.blendOrder.length, 'vBlendLow', 'vBlendHigh', 'uBlendLayer', 'uBlendOrder'),
    'diffuseColor.rgb *= floorAlbedo * vFloorShade;',
  ].join('\n');
}

const VERTEX_HEAD: string = [
  'attribute float floorSolid;',
  'attribute float floorShade;',
  'attribute vec4 floorFringeLow;',
  'attribute vec4 floorFringeHigh;',
  'attribute vec4 floorBlendLow;',
  'attribute vec4 floorBlendHigh;',
  'varying vec2 vGroundXZ;',
  'flat varying float vFloorSolid;',
  'varying float vFloorShade;',
  'varying vec4 vFringeLow;',
  'varying vec4 vFringeHigh;',
  'varying vec4 vBlendLow;',
  'varying vec4 vBlendHigh;',
].join('\n');

const VERTEX_BODY: string = [
  'vGroundXZ = uv;',
  'vFloorSolid = floorSolid;',
  'vFloorShade = floorShade;',
  'vFringeLow = floorFringeLow;',
  'vFringeHigh = floorFringeHigh;',
  'vBlendLow = floorBlendLow;',
  'vBlendHigh = floorBlendHigh;',
].join('\n');

export function floorProgramKey(layout: FloorLayout): string {
  const glows: string = layout.layers.map((layer: FloorLayerLook, index: number): string => (layer.glow === null ? '' : `${index}${glowKey(layer.glow)}`)).join('');
  return `storm-floor-${clampedWet(layout.wet)}-${layout.fringeOrder.length}-${layout.blendOrder.length}-${glows}`;
}

function padded(values: readonly number[], length: number): number[] {
  return Array.from({ length }, (_: unknown, at: number): number => values[at] ?? 0);
}

export function patchFloorShader(shader: Pick<WebGLProgramParametersWithUniforms, 'vertexShader' | 'fragmentShader'>, layout: FloorLayout): void {
  const parts: WetGroundParts = wetGroundFragment(layout.wet);
  shader.vertexShader = shader.vertexShader.replace('void main() {', `${VERTEX_HEAD}\nvoid main() {`).replace('#include <fog_vertex>', `#include <fog_vertex>\n${VERTEX_BODY}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', `${floorHead(layout, parts)}\nvoid main() {`)
    .replace('#include <map_fragment>', floorBody(layout))
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = floorRough;')
    .replace('#include <normal_fragment_maps>', `normal = normalize( tbn * floorNormal );\n${parts.normalAfter}`)
    .replace('#include <aomap_fragment>', ShaderChunk.aomap_fragment.replace('texture2D( aoMap, vAoMapUv ).r', 'floorAo'))
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += floorGlow;');
}

export function createFloorMaterial(layout: FloorLayout): FloorMaterial {
  const colour: IUniform<Texture | null> = { value: null };
  const detail: IUniform<Texture | null> = { value: null };
  const most: number = FLOOR_STACK.most;
  const uniforms: Record<string, IUniform> = {
    uFloorColour: colour,
    uFloorDetail: detail,
    uLayerScale: { value: padded(layout.layers.map((layer: FloorLayerLook): number => layer.scale), most) },
    uLayerTint: { value: Array.from({ length: most }, (_: unknown, at: number): Color => new Color(layout.layers[at]?.tint ?? '#ffffff')) },
    uLayerRough: { value: padded(layout.layers.map((layer: FloorLayerLook): number => layer.roughness), most) },
    uLayerNormal: { value: padded(layout.layers.map((layer: FloorLayerLook): number => layer.normalScale), most) },
    uFringeLayer: { value: padded(layout.fringes, FLOOR_STACK.slots) },
    uBlendLayer: { value: padded(layout.blends, FLOOR_STACK.slots) },
    uFringeOrder: { value: padded(layout.fringeOrder, FLOOR_STACK.slots) },
    uBlendOrder: { value: padded(layout.blendOrder, FLOOR_STACK.slots) },
    uGlowTime: GLOW_CLOCK,
  };
  const material: MeshStandardMaterial = new MeshStandardMaterial({ name: 'floor:layered', color: 0xffffff, roughness: 1, metalness: 0, normalMap: FLAT_NORMAL, aoMap: FULL_LIGHT });
  const key: string = floorProgramKey(layout);
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms): void => {
    Object.assign(shader.uniforms, uniforms);
    patchFloorShader(shader, layout);
  };
  material.customProgramCacheKey = (): string => key;
  return {
    material,
    useArrays(colourArray: Texture, detailArray: Texture): void {
      colour.value = colourArray;
      detail.value = detailArray;
    },
  };
}
