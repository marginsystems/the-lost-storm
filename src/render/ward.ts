import type { BufferGeometry, IUniform, Scene } from 'three';
import { AdditiveBlending, Color, Mesh, PlaneGeometry, ShaderMaterial } from 'three';
import type { World } from '../../sim/world/types.ts';

export const WARD = {
  color: 0xf4efe2,
  reach: 1.7,
  spread: 0.55,
  alpha: 0.42,
  lift: 0.04,
  breakupScale: 1.6,
  breakupDepth: 0.35,
  drift: 0.18,
  pulseSpeed: 2.2,
  pulseDepth: 0.12,
  stiffness: 70,
  damping: 12,
  rest: 0.002,
  longestStep: 1 / 30,
} as const;

export const WARD_GLOW_VERTEX: string = ['varying vec2 vSpot;', 'void main() {', '  vSpot = position.xy;', '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);', '}'].join('\n');

export const WARD_GLOW_FRAGMENT: string = [
  'uniform vec3 uColor;',
  'uniform float uStrength;',
  'uniform float uTime;',
  'uniform float uReach;',
  'uniform float uSpread;',
  'uniform float uBreakupScale;',
  'uniform float uBreakupDepth;',
  'varying vec2 vSpot;',
  'float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
  'float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);',
  '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }',
  'void main() {',
  '  float d = length(vSpot) / uReach;',
  '  float pool = exp(-(d * d) / (uSpread * uSpread)) * (1.0 - smoothstep(0.7, 1.0, d));',
  '  float n = noise(vSpot * uBreakupScale + vec2(uTime, -uTime * 0.7));',
  '  float alpha = max(pool * (1.0 - uBreakupDepth * n) * uStrength, 0.0);',
  '  gl_FragColor = vec4(uColor * alpha, alpha);',
  '}',
].join('\n');

interface WardUniforms {
  readonly [name: string]: IUniform<Color | number>;
  readonly uColor: IUniform<Color>;
  readonly uStrength: IUniform<number>;
  readonly uTime: IUniform<number>;
}

export function wardStrength(level: number, left: number, window: number, clock: number): number {
  const remaining: number = window > 0 ? Math.min(1, Math.max(0, left / window)) : 0;
  const pulse: number = 1 - WARD.pulseDepth + WARD.pulseDepth * Math.sin(clock * WARD.pulseSpeed);
  return Math.max(0, level) * pulse * remaining;
}

export interface Ward {
  update(dt: number, world: World): void;
}

export function createWard(scene: Scene): Ward {
  const uniforms: WardUniforms = { uColor: { value: new Color(WARD.color) }, uStrength: { value: 0 }, uTime: { value: 0 }, uReach: { value: WARD.reach }, uSpread: { value: WARD.spread }, uBreakupScale: { value: WARD.breakupScale }, uBreakupDepth: { value: WARD.breakupDepth } };
  const geometry: BufferGeometry = new PlaneGeometry(WARD.reach * 2, WARD.reach * 2);
  const glow: Mesh<BufferGeometry, ShaderMaterial> = new Mesh(geometry, new ShaderMaterial({ vertexShader: WARD_GLOW_VERTEX, fragmentShader: WARD_GLOW_FRAGMENT, uniforms, transparent: true, depthWrite: false, blending: AdditiveBlending }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = WARD.lift;
  glow.visible = false;
  scene.add(glow);
  let level: number = 0;
  let velocity: number = 0;
  let clock: number = 0;
  return {
    update(dt: number, world: World): void {
      const player = world.player;
      const target: number = player.alive && player.invulnerable > 0 ? 1 : 0;
      const step: number = Math.min(dt, WARD.longestStep);
      velocity += ((target - level) * WARD.stiffness - velocity * WARD.damping) * step;
      level += velocity * step;
      clock += dt;
      const visible: boolean = target > 0 || Math.abs(level) > WARD.rest;
      glow.visible = visible;
      if (!visible) {
        level = 0;
        velocity = 0;
        return;
      }
      glow.position.set(player.pos.x, WARD.lift, player.pos.z);
      uniforms.uStrength.value = wardStrength(level, player.invulnerable, world.content.player.respawnInvulnerability, clock) * WARD.alpha;
      uniforms.uTime.value = clock * WARD.drift;
    },
  };
}
