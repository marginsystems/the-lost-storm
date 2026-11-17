import type { IUniform } from 'three';
import { Color, DoubleSide, NormalBlending, ShaderMaterial } from 'three';
import type { MarkerVeil, VeilFlow, VeilShape } from '../../sim/content/marker-types.ts';

export const PLACE_VEIL = {
  archSwirl: 1.6,
  archSpeed: 0.32,
  archBody: 0.86,
  archDeep: 0.06,
  archLift: 0.3,
  archRim: 0.32,
  archFloor: 0.12,
  archStreak: 0.26,
  archBase: 0.55,
  archGain: 0.25,
  archCap: 1.4,
  archFeather: 0.08,
  wellSteps: 5,
  wellStone: 0.42,
  wellFalloff: 1.4,
  wellNose: 0.07,
  wellDeep: 0.3,
  wellSpeed: 0.22,
  wellWall: 4,
  wellMurk: 0.12,
  wellBase: 0.25,
} as const;

const VERTEX: string = ['varying vec2 vUv;', 'void main() {', '  vUv = uv;', '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);', '}'].join('\n');

const NOISE: readonly string[] = [
  'float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
  'float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);',
  '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }',
  'float fbm(vec2 p) { return noise(p) * 0.55 + noise(p * 2.1 + 7.3) * 0.3 + noise(p * 4.3 - 3.1) * 0.15; }',
];

const ARCH_FRAGMENT: string = [
  'uniform float uTime;',
  'uniform float uStrength;',
  'uniform float uFlow;',
  'uniform float uAspect;',
  'uniform vec3 uEdge;',
  'uniform vec3 uCore;',
  'varying vec2 vUv;',
  ...NOISE,
  'void main() {',
  '  float x = (vUv.x - 0.5) * 2.0;',
  '  float y = (1.0 - vUv.y) * uAspect * 2.0;',
  '  float spring = uAspect * 2.0 - 1.0;',
  '  float d = y > spring ? length(vec2(x, y - spring)) : abs(x);',
  `  float inside = 1.0 - smoothstep(1.0 - ${PLACE_VEIL.archFeather.toFixed(3)}, 1.0, d);`,
  `  float swirl = fbm(vec2(x * ${PLACE_VEIL.archSwirl.toFixed(3)}, y * 1.1 - uTime * ${PLACE_VEIL.archSpeed.toFixed(3)} * uFlow));`,
  '  float curl = fbm(vec2(x * 3.1 + swirl * 1.7, y * 2.2 - uTime * 0.5 * uFlow));',
  '  float rim = smoothstep(0.55, 0.97, d);',
  '  float floorLight = exp(-y * 1.1);',
  '  float level = clamp(uStrength, 0.0, 2.0);',
  `  vec3 body = mix(uEdge * ${PLACE_VEIL.archDeep.toFixed(3)}, uEdge * ${PLACE_VEIL.archLift.toFixed(3)}, swirl);`,
  `  vec3 colour = body + uCore * (rim * ${PLACE_VEIL.archRim.toFixed(3)} + floorLight * ${PLACE_VEIL.archFloor.toFixed(3)} + curl * curl * curl * ${PLACE_VEIL.archStreak.toFixed(3)});`,
  `  float alpha = inside * clamp(${PLACE_VEIL.archBody.toFixed(3)} + 0.14 * rim, 0.0, 1.0) * clamp(level, 0.0, 1.0);`,
  `  gl_FragColor = vec4(colour * (${PLACE_VEIL.archBase.toFixed(3)} + ${PLACE_VEIL.archGain.toFixed(3)} * min(level, ${PLACE_VEIL.archCap.toFixed(3)})), alpha);`,
  '}',
].join('\n');

const WELL_FRAGMENT: string = [
  'uniform float uTime;',
  'uniform float uStrength;',
  'uniform float uFlow;',
  'uniform vec3 uEdge;',
  'uniform vec3 uCore;',
  'uniform vec3 uStone;',
  'varying vec2 vUv;',
  ...NOISE,
  'void main() {',
  '  float along = (1.0 - vUv.y) * 2.0;',
  '  float depth = clamp(along, 0.0, 1.0);',
  '  float wall = max(along - 1.0, 0.0);',
  `  float step = fract(depth * ${PLACE_VEIL.wellSteps.toFixed(1)});`,
  '  float tread = smoothstep(0.0, 0.08, step) * (1.0 - smoothstep(0.7, 0.86, step));',
  '  float nose = (1.0 - smoothstep(0.0, 0.02, step)) + smoothstep(0.9, 1.0, step);',
  `  float fall = pow(clamp(1.0 - depth, 0.0, 1.0), ${PLACE_VEIL.wellFalloff.toFixed(3)});`,
  '  float sides = smoothstep(0.0, 0.14, vUv.x) * (1.0 - smoothstep(0.86, 1.0, vUv.x));',
  '  float level = clamp(uStrength, 0.0, 2.0);',
  `  vec3 stone = uStone * (${PLACE_VEIL.wellBase.toFixed(3)} + 0.75 * tread) * fall * (0.5 + 0.5 * sides);`,
  `  float drift = fbm(vec2(vUv.x * 3.4, depth * 5.0 + uTime * ${PLACE_VEIL.wellSpeed.toFixed(3)} * uFlow));`,
  `  vec3 glow = uEdge * clamp(nose, 0.0, 1.0) * fall * ${PLACE_VEIL.wellNose.toFixed(3)} + uCore * smoothstep(0.55, 1.0, depth) * drift * drift * drift * ${PLACE_VEIL.wellDeep.toFixed(3)};`,
  `  vec3 murk = uEdge * ${PLACE_VEIL.wellMurk.toFixed(3)} * drift * drift * exp(-wall * ${PLACE_VEIL.wellWall.toFixed(3)});`,
  '  vec3 colour = wall > 0.0 ? murk * level : stone + glow * level;',
  '  gl_FragColor = vec4(colour, 1.0);',
  '}',
].join('\n');

export interface VeilUniforms {
  readonly [name: string]: IUniform<Color | number>;
  readonly uTime: IUniform<number>;
  readonly uStrength: IUniform<number>;
  readonly uFlow: IUniform<number>;
  readonly uAspect: IUniform<number>;
  readonly uEdge: IUniform<Color>;
  readonly uCore: IUniform<Color>;
  readonly uStone: IUniform<Color>;
}

export interface PlaceVeil {
  readonly material: ShaderMaterial;
  readonly uniforms: VeilUniforms;
}

function flowSign(flow: VeilFlow): number {
  return flow === 'rise' ? 1 : -1;
}

function fragmentFor(shape: VeilShape): string {
  return shape === 'arch' ? ARCH_FRAGMENT : WELL_FRAGMENT;
}

export function createPlaceVeil(veil: MarkerVeil, aspect: number, stone: Color): PlaceVeil {
  const uniforms: VeilUniforms = { uTime: { value: 0 }, uStrength: { value: 0 }, uFlow: { value: flowSign(veil.flow) }, uAspect: { value: aspect }, uEdge: { value: new Color(veil.edge) }, uCore: { value: new Color(veil.core) }, uStone: { value: stone.clone().multiplyScalar(PLACE_VEIL.wellStone) } };
  const arch: boolean = veil.shape === 'arch';
  const material: ShaderMaterial = new ShaderMaterial({ vertexShader: VERTEX, fragmentShader: fragmentFor(veil.shape), uniforms, transparent: arch, depthWrite: !arch, blending: NormalBlending, side: DoubleSide });
  return { material, uniforms };
}
