import type { BufferGeometry, Color, IUniform } from 'three';
import { AdditiveBlending, BufferAttribute, BufferGeometry as Geometry, CylinderGeometry, DoubleSide, FrontSide, Group, Mesh, PlaneGeometry, Points, ShaderMaterial } from 'three';

export const LIGHT_POOL = {
  extent: 1.25,
  core: 0.55,
  fadeFrom: 0.9,
  rippleScale: 7,
  rippleSpeed: 1.4,
  rippleDepth: 0.12,
  breakupScale: 0.9,
  breakupDepth: 0.25,
  drift: 0.12,
  columnShare: 0.42,
  columnHeight: 4.6,
  columnSegments: 32,
  columnStrength: 0.9,
  columnRise: 1.3,
  columnStreaks: 6,
  columnSpeed: 0.45,
  motes: 28,
  moteSize: 26,
  moteSpeed: 0.22,
  moteStrength: 1.4,
  deepen: 0.35,
  peak: 0.9,
  columnPeak: 0.45,
} as const;

export const POOL_VERTEX: string = ['uniform float uExtent;', 'varying vec2 vSpot;', 'void main() {', '  vSpot = position.xy * 2.0 * uExtent;', '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);', '}'].join('\n');

export const POOL_FRAGMENT: string = [
  'uniform vec3 uColor;',
  'uniform float uStrength;',
  'uniform float uRadius;',
  'uniform float uTime;',
  'varying vec2 vSpot;',
  'float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
  'float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);',
  '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }',
  'void main() {',
  '  float d = length(vSpot) / max(uRadius, 0.001);',
  `  float core = exp(-(d * d) / ${(LIGHT_POOL.core * LIGHT_POOL.core).toFixed(4)});`,
  `  float fade = 1.0 - smoothstep(${LIGHT_POOL.fadeFrom.toFixed(3)}, ${LIGHT_POOL.extent.toFixed(3)}, d);`,
  `  float ripple = 1.0 - ${LIGHT_POOL.rippleDepth.toFixed(3)} * d * (0.5 + 0.5 * sin(d * ${LIGHT_POOL.rippleScale.toFixed(3)} - uTime * ${LIGHT_POOL.rippleSpeed.toFixed(3)}));`,
  `  float n = noise(vSpot * ${LIGHT_POOL.breakupScale.toFixed(3)} + vec2(uTime * ${(LIGHT_POOL.drift * 3).toFixed(3)}, -uTime * ${LIGHT_POOL.drift.toFixed(3)}));`,
  `  float glow = max(core * ripple * fade * (1.0 - ${LIGHT_POOL.breakupDepth.toFixed(3)} * n * d) * uStrength, 0.0);`,
  '  vec3 deep = uColor * uColor / max(max(uColor.r, max(uColor.g, uColor.b)), 0.001);',
  `  vec3 lit = mix(uColor, deep, core * ${LIGHT_POOL.deepen.toFixed(3)}) * glow;`,
  `  lit /= max(1.0, max(lit.r, max(lit.g, lit.b)) / ${LIGHT_POOL.peak.toFixed(3)});`,
  '  gl_FragColor = vec4(lit, 1.0);',
  '}',
].join('\n');

export const COLUMN_VERTEX: string = [
  'varying vec2 vSheet;',
  'varying float vFacing;',
  'void main() {',
  '  vSheet = uv;',
  '  vec4 seen = modelViewMatrix * vec4(position, 1.0);',
  '  vFacing = abs(dot(normalize(normalMatrix * normal), normalize(-seen.xyz)));',
  '  gl_Position = projectionMatrix * seen;',
  '}',
].join('\n');

export const COLUMN_FRAGMENT: string = [
  'uniform vec3 uColor;',
  'uniform float uStrength;',
  'uniform float uTime;',
  'varying vec2 vSheet;',
  'varying float vFacing;',
  'void main() {',
  '  float fall = max(1.0 - vSheet.y, 0.0);',
  `  float rise = pow(fall, ${LIGHT_POOL.columnRise.toFixed(3)});`,
  '  float side = smoothstep(0.0, 1.0, vFacing);',
  `  float streak = 0.6 + 0.4 * sin(vSheet.x * ${(LIGHT_POOL.columnStreaks * Math.PI * 2).toFixed(3)} + sin(vSheet.y * 5.0 - uTime * 2.0) * 1.5);`,
  `  float lift = 0.75 + 0.25 * sin(vSheet.y * 11.0 - uTime * ${(LIGHT_POOL.columnSpeed * 10).toFixed(3)});`,
  '  float glow = max(rise * side * side * streak * lift * uStrength, 0.0);',
  '  vec3 deep = uColor * uColor / max(max(uColor.r, max(uColor.g, uColor.b)), 0.001);',
  `  vec3 lit = mix(uColor, deep, rise * ${LIGHT_POOL.deepen.toFixed(3)}) * glow;`,
  `  lit /= max(1.0, max(lit.r, max(lit.g, lit.b)) / ${LIGHT_POOL.columnPeak.toFixed(3)});`,
  '  gl_FragColor = vec4(lit, 1.0);',
  '}',
].join('\n');

export const MOTE_VERTEX: string = [
  'attribute vec3 seed;',
  'uniform float uTime;',
  'uniform float uRadius;',
  'uniform float uHeight;',
  'uniform float uSize;',
  'varying float vFade;',
  'void main() {',
  `  float t = fract(seed.z + uTime * ${LIGHT_POOL.moteSpeed.toFixed(3)} * (0.6 + 0.4 * seed.x));`,
  '  float turn = seed.x * 6.2832 + uTime * 0.3;',
  '  vec3 at = vec3(cos(turn) * seed.y * uRadius, t * uHeight, sin(turn) * seed.y * uRadius);',
  '  vFade = smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.55, 1.0, t));',
  '  vec4 seen = modelViewMatrix * vec4(at, 1.0);',
  '  gl_PointSize = uSize / max(-seen.z, 1.0);',
  '  gl_Position = projectionMatrix * seen;',
  '}',
].join('\n');

export const MOTE_FRAGMENT: string = [
  'uniform vec3 uColor;',
  'uniform float uStrength;',
  'varying float vFade;',
  'void main() {',
  '  float r = length(gl_PointCoord - 0.5) * 2.0;',
  '  float soft = max(1.0 - r * r, 0.0);',
  '  float glow = max(soft * soft * vFade * uStrength, 0.0);',
  '  gl_FragColor = vec4(uColor * glow, 1.0);',
  '}',
].join('\n');

interface PoolUniforms {
  readonly [name: string]: IUniform<Color | number>;
  readonly uColor: IUniform<Color>;
  readonly uStrength: IUniform<number>;
  readonly uRadius: IUniform<number>;
  readonly uTime: IUniform<number>;
}

export interface LightPool {
  readonly group: Group;
  place(x: number, y: number, z: number, radius: number): void;
  set(strength: number, time: number): void;
  dispose(): void;
}

export function poolExtent(radius: number): number {
  return radius * LIGHT_POOL.extent;
}

export function poolLight(d: number): number {
  const t: number = Math.min(1, Math.max(0, (d - LIGHT_POOL.fadeFrom) / (LIGHT_POOL.extent - LIGHT_POOL.fadeFrom)));
  return Math.exp(-(d * d) / (LIGHT_POOL.core * LIGHT_POOL.core)) * (1 - t * t * (3 - 2 * t));
}

function additive(vertexShader: string, fragmentShader: string, uniforms: PoolUniforms, doubleSided: boolean): ShaderMaterial {
  return new ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, blending: AdditiveBlending, side: doubleSided ? DoubleSide : FrontSide });
}

function moteSeeds(count: number): BufferGeometry {
  const seeds: Float32Array = new Float32Array(count * 3);
  for (let index: number = 0; index < count; index += 1) {
    const golden: number = (index * 0.618034) % 1;
    seeds[index * 3] = golden;
    seeds[index * 3 + 1] = Math.sqrt(((index * 0.381966 + 0.5) % 1) * 0.85);
    seeds[index * 3 + 2] = index / count;
  }
  const geometry: Geometry = new Geometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('seed', new BufferAttribute(seeds, 3));
  return geometry;
}

export function createLightPool(color: Color, column: boolean): LightPool {
  const extent: IUniform<number> = { value: poolExtent(1) };
  const uniforms: PoolUniforms = { uColor: { value: color.clone() }, uStrength: { value: 0 }, uRadius: { value: 1 }, uExtent: extent, uTime: { value: 0 } };
  const group: Group = new Group();
  const poolMaterial: ShaderMaterial = additive(POOL_VERTEX, POOL_FRAGMENT, uniforms, false);
  const pool: Mesh<PlaneGeometry, ShaderMaterial> = new Mesh(new PlaneGeometry(1, 1), poolMaterial);
  pool.rotation.x = -Math.PI / 2;
  group.add(pool);
  const columnUniforms: PoolUniforms = { uColor: uniforms.uColor, uStrength: { value: 0 }, uRadius: { value: 1 }, uTime: uniforms.uTime };
  const moteUniforms: PoolUniforms = { uColor: uniforms.uColor, uStrength: { value: 0 }, uRadius: { value: 1 }, uTime: uniforms.uTime, uHeight: { value: LIGHT_POOL.columnHeight }, uSize: { value: LIGHT_POOL.moteSize } };
  const shaft: Mesh<BufferGeometry, ShaderMaterial> | null = column ? new Mesh(new CylinderGeometry(1, 1, 1, LIGHT_POOL.columnSegments, 1, true), additive(COLUMN_VERTEX, COLUMN_FRAGMENT, columnUniforms, true)) : null;
  const motes: Points<BufferGeometry, ShaderMaterial> | null = column ? new Points(moteSeeds(LIGHT_POOL.motes), additive(MOTE_VERTEX, MOTE_FRAGMENT, moteUniforms, false)) : null;
  if (shaft !== null) {
    shaft.position.y = LIGHT_POOL.columnHeight / 2;
    group.add(shaft);
  }
  if (motes !== null) {
    motes.frustumCulled = false;
    group.add(motes);
  }
  let shownRadius: number = -1;
  return {
    group,
    place(x: number, y: number, z: number, radius: number): void {
      group.position.set(x, y, z);
      if (radius === shownRadius) return;
      shownRadius = radius;
      uniforms.uRadius.value = radius;
      extent.value = poolExtent(radius);
      moteUniforms.uRadius.value = radius * LIGHT_POOL.columnShare;
      pool.scale.setScalar(poolExtent(radius) * 2);
      shaft?.scale.set(radius * LIGHT_POOL.columnShare, LIGHT_POOL.columnHeight, radius * LIGHT_POOL.columnShare);
    },
    set(strength: number, time: number): void {
      uniforms.uStrength.value = strength;
      uniforms.uTime.value = time;
      columnUniforms.uStrength.value = strength * LIGHT_POOL.columnStrength;
      moteUniforms.uStrength.value = strength * LIGHT_POOL.moteStrength;
    },
    dispose(): void {
      pool.geometry.dispose();
      poolMaterial.dispose();
      shaft?.geometry.dispose();
      shaft?.material.dispose();
      motes?.geometry.dispose();
      motes?.material.dispose();
    },
  };
}
