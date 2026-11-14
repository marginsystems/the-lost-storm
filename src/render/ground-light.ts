import type { Color, IUniform } from 'three';
import { CustomBlending, DoubleSide, Mesh, NormalBlending, OneFactor, OneMinusSrcAlphaFactor, PlaneGeometry, ShaderMaterial } from 'three';
import type { Spring } from '../hud/character-spring.ts';
import { springTo, stepSpring } from '../hud/character-spring.ts';

export const GROUND_LIGHT = {
  reachWidths: 3.2,
  minWidth: 0.12,
  outlineScale: 1.5,
  outlineSpeed: 0.18,
  insideScale: 0.55,
  insideSpeed: 0.22,
  insideDepth: 0.55,
  wobbleBoost: 1.8,
  meanderScale: 0.45,
  meanderSpeed: 0.12,
  meanderShare: 0.8,
  innerSpread: 2.2,
  outerSpread: 0.85,
  bandBreakScale: 2.2,
  bandBreakSpeed: 0.15,
  bandBreakDepth: 0.8,
  laneBreakScale: 0.45,
  cover: 0.45,
  laneSoftening: 0.6,
  peak: 0.95,
  height: 0.06,
  order: 5,
  shadeOrder: 3,
  flareRise: 0.14,
  holdRise: 0.18,
  holdFall: 0.3,
  hollowFloor: 0.3,
} as const;

function smooth(t: number): number {
  const clamped: number = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

export function flare(t: number): number {
  return smooth(t / GROUND_LIGHT.flareRise) * (1 - smooth(t));
}

export function held(t: number): number {
  return smooth(t / GROUND_LIGHT.holdRise) * (1 - smooth((t - (1 - GROUND_LIGHT.holdFall)) / GROUND_LIGHT.holdFall));
}

export function spread(t: number): number {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

export type GroundLightForm =
  | { readonly kind: 'round'; readonly radius: number; readonly inner: number; readonly arc: number }
  | { readonly kind: 'lane'; readonly halfWidth: number; readonly start: number; readonly length: number };

export type GroundTone = 'light' | 'shade';

export interface GroundLightLook {
  readonly fill: number;
  readonly band: number;
  readonly width: number;
  readonly wobble: number;
  readonly hollow?: number;
  readonly grain?: number;
}

export interface GroundLight {
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  show(strength: number): void;
  front(share: number): void;
  step(dt: number, time: number): void;
  setNow(strength: number): void;
  pose(strength: number, time: number): void;
  readonly strength: number;
  dispose(): void;
}

interface GroundUniforms {
  readonly [name: string]: IUniform<unknown>;
  readonly uColor: IUniform<Color>;
  readonly uStrength: IUniform<number>;
  readonly uTime: IUniform<number>;
  readonly uSeed: IUniform<number>;
  readonly uExtent: IUniform<number>;
  readonly uRadius: IUniform<number>;
  readonly uInner: IUniform<number>;
  readonly uArc: IUniform<number>;
  readonly uLane: IUniform<number>;
  readonly uLaneSpan: IUniform<number>;
  readonly uLaneStart: IUniform<number>;
  readonly uFill: IUniform<number>;
  readonly uBand: IUniform<number>;
  readonly uWidth: IUniform<number>;
  readonly uWobble: IUniform<number>;
  readonly uFront: IUniform<number>;
  readonly uShade: IUniform<number>;
  readonly uHollow: IUniform<number>;
  readonly uGrain: IUniform<number>;
}

const glsl = (value: number): string => value.toFixed(4);

export const GROUND_LIGHT_VERTEX: string = ['uniform float uExtent;', 'varying vec2 vSpot;', 'void main() {', '  vSpot = position.xy * 2.0 * uExtent;', '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);', '}'].join('\n');

export const GROUND_LIGHT_FRAGMENT: string = [
  'uniform vec3 uColor;',
  'uniform float uStrength;',
  'uniform float uTime;',
  'uniform float uSeed;',
  'uniform float uRadius;',
  'uniform float uInner;',
  'uniform float uArc;',
  'uniform float uLane;',
  'uniform float uLaneSpan;',
  'uniform float uLaneStart;',
  'uniform float uFill;',
  'uniform float uBand;',
  'uniform float uWidth;',
  'uniform float uWobble;',
  'uniform float uFront;',
  'uniform float uShade;',
  'uniform float uHollow;',
  'uniform float uGrain;',
  'varying vec2 vSpot;',
  'float groundHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
  'float groundNoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);',
  '  return mix(mix(groundHash(i), groundHash(i + vec2(1.0, 0.0)), u.x), mix(groundHash(i + vec2(0.0, 1.0)), groundHash(i + vec2(1.0, 1.0)), u.x), u.y); }',
  'float groundFbm(vec2 p) { return groundNoise(p) * 0.55 + groundNoise(p * 2.07 + 17.3) * 0.3 + groundNoise(p * 4.13 + 41.9) * 0.15; }',
  'float soft(float edge, float width, float x) { return 1.0 - smoothstep(edge - width, edge + width, x); }',
  'void main() {',
  '  float r = length(vSpot);',
  '  vec2 dir = vSpot / max(r, 0.001);',
  '  vec2 scaled = vSpot / max(uRadius, 0.5);',
  `  float outline = groundFbm(scaled * ${glsl(GROUND_LIGHT.outlineScale)} + vec2(uSeed, uTime * ${glsl(GROUND_LIGHT.outlineSpeed)})) - 0.5;`,
  `  float inside = groundFbm(vSpot * ${glsl(GROUND_LIGHT.insideScale)} + vec2(uSeed * 1.7 + uTime * ${glsl(GROUND_LIGHT.insideSpeed)}, -uTime * ${glsl(GROUND_LIGHT.insideSpeed * 0.6)}));`,
  '  float w = max(uWidth, 0.001);',
  '  float reach = uRadius * uFront;',
  `  float meander = groundFbm(vSpot * ${glsl(GROUND_LIGHT.meanderScale)} + vec2(uSeed * 0.7, uTime * ${glsl(GROUND_LIGHT.meanderSpeed)})) - 0.5;`,
  `  float wobble = (outline + meander * ${glsl(GROUND_LIGHT.meanderShare)}) * uWobble * ${glsl(GROUND_LIGHT.wobbleBoost)};`,
  '  float at = r + wobble;',
  '  float across = abs(vSpot.x) + wobble;',
  `  float along = vSpot.y + outline * uWobble * ${glsl(GROUND_LIGHT.laneSoftening)};`,
  '  float roundFill = soft(reach, w * 1.5, at) * (1.0 - soft(uInner, w, at));',
  '  float off = at - reach;',
  `  float spreadW = w * (off < 0.0 ? ${glsl(GROUND_LIGHT.innerSpread)} : ${glsl(GROUND_LIGHT.outerSpread)});`,
  '  float roundBand = exp(-(off * off) / (spreadW * spreadW));',
  '  float angle = abs(atan(vSpot.x, vSpot.y));',
  '  float sector = uArc >= 6.28 ? 1.0 : soft(uArc * 0.5, w / max(r, w), angle);',
  '  float laneSide = soft(uRadius, w, across);',
  '  float laneEnds = (1.0 - soft(uLaneStart, w, along)) * soft(uLaneStart + uLaneSpan * uFront, w * 1.5, along);',
  '  float laneFill = laneSide * laneEnds;',
  '  float laneBand = exp(-((across - uRadius) * (across - uRadius)) / (w * w)) * laneEnds;',
  `  float centre = mix(1.0, ${glsl(GROUND_LIGHT.hollowFloor)} + ${glsl(1 - GROUND_LIGHT.hollowFloor)} * smoothstep(0.0, max(reach, 0.001), at), uHollow * (1.0 - uLane));`,
  '  float fill = mix(roundFill * sector, laneFill, uLane) * centre;',
  `  vec2 breakAt = mix(scaled * ${glsl(GROUND_LIGHT.bandBreakScale)}, vec2(vSpot.y * ${glsl(GROUND_LIGHT.laneBreakScale)}, uSeed), uLane);`,
  `  float broken = smoothstep(0.2, 0.8, groundFbm(breakAt + vec2(uSeed * 0.3, uTime * ${glsl(GROUND_LIGHT.bandBreakSpeed)})));`,
  `  float band = mix(roundBand * sector, laneBand, uLane) * mix(1.0, broken * 1.5, ${glsl(GROUND_LIGHT.bandBreakDepth)});`,
  '  float life = 1.0 - uGrain * inside;',
  '  float glow = max((fill * uFill + band * uBand) * life * uStrength, 0.0);',
  '  vec3 lit = uColor * glow;',
  `  lit /= max(1.0, max(lit.r, max(lit.g, lit.b)) / ${glsl(GROUND_LIGHT.peak)});`,
  `  gl_FragColor = uShade > 0.5 ? vec4(uColor, clamp(glow, 0.0, 1.0)) : vec4(lit, clamp(glow * ${glsl(GROUND_LIGHT.cover)}, 0.0, 1.0));`,
  '}',
].join('\n');

export function groundLightExtent(form: GroundLightForm, look: GroundLightLook): number {
  const margin: number = Math.max(look.width, GROUND_LIGHT.minWidth) * GROUND_LIGHT.reachWidths + look.wobble * GROUND_LIGHT.wobbleBoost;
  const reach: number = form.kind === 'round' ? form.radius : Math.max(form.halfWidth, form.start + form.length);
  return reach + margin;
}

export function groundLightMaterial(color: Color, form: GroundLightForm, look: GroundLightLook, tone: GroundTone): ShaderMaterial {
  const lane: boolean = form.kind === 'lane';
  const uniforms: GroundUniforms = {
    uColor: { value: color.clone() },
    uStrength: { value: 0 },
    uTime: { value: 0 },
    uSeed: { value: Math.random() * 40 },
    uExtent: { value: groundLightExtent(form, look) },
    uRadius: { value: form.kind === 'round' ? form.radius : form.halfWidth },
    uInner: { value: form.kind === 'round' ? form.inner : 0 },
    uArc: { value: form.kind === 'round' ? form.arc : Math.PI * 2 },
    uLane: { value: lane ? 1 : 0 },
    uLaneSpan: { value: form.kind === 'lane' ? form.length : 0 },
    uLaneStart: { value: form.kind === 'lane' ? form.start : 0 },
    uFill: { value: look.fill },
    uBand: { value: look.band },
    uWidth: { value: Math.max(look.width, GROUND_LIGHT.minWidth) },
    uWobble: { value: look.wobble },
    uFront: { value: 1 },
    uShade: { value: tone === 'shade' ? 1 : 0 },
    uHollow: { value: look.hollow ?? 0 },
    uGrain: { value: look.grain ?? GROUND_LIGHT.insideDepth },
  };
  return new ShaderMaterial({ uniforms, vertexShader: GROUND_LIGHT_VERTEX, fragmentShader: GROUND_LIGHT_FRAGMENT, transparent: true, depthWrite: false, blending: tone === 'shade' ? NormalBlending : CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor, side: DoubleSide });
}

function setUniform(material: ShaderMaterial, name: string, value: number): void {
  const uniform: IUniform<unknown> | undefined = material.uniforms[name];
  if (uniform !== undefined) uniform.value = value;
}

export function createGroundLight(color: Color, form: GroundLightForm, look: GroundLightLook, tone: GroundTone = 'light'): GroundLight {
  const material: ShaderMaterial = groundLightMaterial(color, form, look, tone);
  const mesh: Mesh<PlaneGeometry, ShaderMaterial> = new Mesh(new PlaneGeometry(1, 1), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.setScalar(groundLightExtent(form, look) * 2);
  mesh.renderOrder = tone === 'shade' ? GROUND_LIGHT.shadeOrder : GROUND_LIGHT.order;
  mesh.frustumCulled = false;
  const level: Spring = { value: 0, velocity: 0, target: 0 };
  return {
    mesh,
    get strength(): number {
      return level.value;
    },
    show(strength: number): void {
      springTo(level, strength);
    },
    setNow(strength: number): void {
      level.value = strength;
      level.target = strength;
      level.velocity = 0;
      setUniform(material, 'uStrength', strength);
    },
    pose(strength: number, time: number): void {
      setUniform(material, 'uStrength', Math.max(0, strength));
      setUniform(material, 'uTime', time);
    },
    front(share: number): void {
      setUniform(material, 'uFront', share);
    },
    step(dt: number, time: number): void {
      stepSpring(level, dt);
      setUniform(material, 'uStrength', Math.max(0, level.value));
      setUniform(material, 'uTime', time);
    },
    dispose(): void {
      mesh.geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    },
  };
}
