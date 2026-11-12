import type { Color, IUniform } from 'three';
import { AdditiveBlending, Mesh, PlaneGeometry, ShaderMaterial } from 'three';

export const GROUND_GLOW = {
  rimAt: 0.92,
  rimWidth: 0.5,
  maxRimShare: 0.22,
  fill: 0.18,
  reach: 2.6,
  breakupScale: 0.9,
  breakupDepth: 0.4,
  drift: 0.12,
} as const;

const VERTEX: string = ['uniform float uExtent;', 'varying vec2 vSpot;', 'void main() {', '  vSpot = position.xy * 2.0 * uExtent;', '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);', '}'].join('\n');

const FRAGMENT: string = [
  'uniform vec3 uColor;',
  'uniform float uStrength;',
  'uniform float uRadius;',
  'uniform float uRim;',
  'uniform float uRimAt;',
  'uniform float uFill;',
  'uniform float uTime;',
  'uniform float uBreakupScale;',
  'uniform float uBreakupDepth;',
  'uniform float uDrift;',
  'varying vec2 vSpot;',
  'float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
  'float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);',
  '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }',
  'void main() {',
  '  float d = length(vSpot);',
  '  float around = atan(vSpot.y, vSpot.x) * uRadius;',
  '  float n = noise(vec2(around * uBreakupScale + uTime * uDrift * 3.0, d * uBreakupScale - uTime * uDrift));',
  '  float rim = exp(-pow((d - uRadius * uRimAt) / uRim, 2.0));',
  '  float fill = (1.0 - smoothstep(0.0, uRadius, d)) * uFill;',
  '  float alpha = max((rim + fill) * (1.0 - uBreakupDepth * n) * uStrength, 0.0);',
  '  gl_FragColor = vec4(uColor, alpha);',
  '}',
].join('\n');

interface GlowUniforms {
  readonly [name: string]: IUniform<Color | number>;
  readonly uColor: IUniform<Color>;
  readonly uStrength: IUniform<number>;
  readonly uRadius: IUniform<number>;
  readonly uRim: IUniform<number>;
  readonly uExtent: IUniform<number>;
  readonly uTime: IUniform<number>;
}

export interface GroundGlow {
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  place(x: number, y: number, z: number, radius: number): void;
  set(strength: number, time: number): void;
  dispose(): void;
}

export function rimWidth(radius: number): number {
  return Math.min(GROUND_GLOW.rimWidth, radius * GROUND_GLOW.maxRimShare);
}

export function glowExtent(radius: number): number {
  return radius + rimWidth(radius) * GROUND_GLOW.reach;
}

export function createGroundGlow(color: Color): GroundGlow {
  const uniforms: GlowUniforms = {
    uColor: { value: color.clone() },
    uStrength: { value: 0 },
    uRadius: { value: 1 },
    uRim: { value: rimWidth(1) },
    uRimAt: { value: GROUND_GLOW.rimAt },
    uFill: { value: GROUND_GLOW.fill },
    uExtent: { value: glowExtent(1) },
    uTime: { value: 0 },
    uBreakupScale: { value: GROUND_GLOW.breakupScale },
    uBreakupDepth: { value: GROUND_GLOW.breakupDepth },
    uDrift: { value: GROUND_GLOW.drift },
  };
  const material: ShaderMaterial = new ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false, blending: AdditiveBlending });
  const mesh: Mesh<PlaneGeometry, ShaderMaterial> = new Mesh(new PlaneGeometry(1, 1), material);
  mesh.rotation.x = -Math.PI / 2;
  let shownRadius: number = -1;
  return {
    mesh,
    place(x: number, y: number, z: number, radius: number): void {
      mesh.position.set(x, y, z);
      if (radius === shownRadius) return;
      shownRadius = radius;
      const extent: number = glowExtent(radius);
      uniforms.uRadius.value = radius;
      uniforms.uRim.value = rimWidth(radius);
      uniforms.uExtent.value = extent;
      mesh.scale.setScalar(extent * 2);
    },
    set(strength: number, time: number): void {
      uniforms.uStrength.value = strength;
      uniforms.uTime.value = time;
    },
    dispose(): void {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
