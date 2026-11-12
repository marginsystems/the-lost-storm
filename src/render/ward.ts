import type { BufferGeometry, IUniform, Scene } from 'three';
import { AdditiveBlending, Color, CylinderGeometry, DoubleSide, Group, Mesh, RingGeometry, ShaderMaterial } from 'three';
import type { World } from '../../sim/world/types.ts';

export const WARD = {
  color: 0xf4efe2,
  inner: 0.62,
  outer: 1.05,
  ringSegments: 48,
  ringAlpha: 0.55,
  lift: 0.05,
  shimmerRadius: 0.8,
  shimmerHeight: 1.1,
  shimmerSegments: 24,
  shimmerAlpha: 0.22,
  shimmerSpeed: 0.9,
  pulseSpeed: 3.2,
  pulseDepth: 0.25,
  fadeFloor: 0.35,
  stiffness: 70,
  damping: 12,
  rest: 0.002,
} as const;

export const WARD_RING_VERTEX: string = ['varying vec2 vSpot;', 'void main() {', '  vSpot = position.xy;', '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);', '}'].join('\n');

export const WARD_RING_FRAGMENT: string = [
  'uniform vec3 uColor;',
  'uniform float uStrength;',
  'uniform float uInner;',
  'uniform float uOuter;',
  'varying vec2 vSpot;',
  'void main() {',
  '  float d = length(vSpot);',
  '  float middle = (uInner + uOuter) * 0.5;',
  '  float band = 1.0 - smoothstep(0.0, (uOuter - uInner) * 0.5, abs(d - middle));',
  '  float alpha = max(band * uStrength, 0.0);',
  '  gl_FragColor = vec4(uColor * alpha, alpha);',
  '}',
].join('\n');

export const WARD_SHIMMER_VERTEX: string = ['varying vec2 vSheet;', 'void main() {', '  vSheet = uv;', '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);', '}'].join('\n');

export const WARD_SHIMMER_FRAGMENT: string = [
  'uniform vec3 uColor;',
  'uniform float uStrength;',
  'uniform float uTime;',
  'varying vec2 vSheet;',
  'void main() {',
  '  float rise = 1.0 - smoothstep(0.0, 1.0, vSheet.y);',
  '  float streak = 0.5 + 0.5 * sin(vSheet.x * 62.83 + uTime * 1.7);',
  '  float drift = 0.5 + 0.5 * sin(vSheet.y * 18.0 - uTime * 6.0 + vSheet.x * 25.13);',
  '  float alpha = max(rise * rise * (0.35 + 0.65 * streak * drift) * uStrength, 0.0);',
  '  gl_FragColor = vec4(uColor * alpha, alpha);',
  '}',
].join('\n');

interface WardUniforms {
  readonly [name: string]: IUniform<Color | number>;
  readonly uColor: IUniform<Color>;
  readonly uStrength: IUniform<number>;
  readonly uTime: IUniform<number>;
  readonly uInner: IUniform<number>;
  readonly uOuter: IUniform<number>;
}

function wardUniforms(): WardUniforms {
  return { uColor: { value: new Color(WARD.color) }, uStrength: { value: 0 }, uTime: { value: 0 }, uInner: { value: WARD.inner }, uOuter: { value: WARD.outer } };
}

function glowMaterial(vertex: string, fragment: string, uniforms: WardUniforms): ShaderMaterial {
  return new ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
}

export function wardStrength(level: number, left: number, window: number, clock: number): number {
  const remaining: number = window > 0 ? Math.min(1, Math.max(0, left / window)) : 0;
  const pulse: number = 1 - WARD.pulseDepth + WARD.pulseDepth * Math.sin(clock * WARD.pulseSpeed);
  return Math.max(0, level) * pulse * (WARD.fadeFloor + (1 - WARD.fadeFloor) * remaining);
}

export interface Ward {
  update(dt: number, world: World): void;
}

export function createWard(scene: Scene, phone: boolean): Ward {
  const ringUniforms: WardUniforms = wardUniforms();
  const shimmerUniforms: WardUniforms = wardUniforms();
  const ringGeometry: BufferGeometry = new RingGeometry(WARD.inner, WARD.outer, WARD.ringSegments);
  const ring: Mesh<BufferGeometry, ShaderMaterial> = new Mesh(ringGeometry, glowMaterial(WARD_RING_VERTEX, WARD_RING_FRAGMENT, ringUniforms));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = WARD.lift;
  const shimmerGeometry: BufferGeometry = new CylinderGeometry(WARD.shimmerRadius, WARD.shimmerRadius, WARD.shimmerHeight, WARD.shimmerSegments, 1, true);
  const shimmer: Mesh<BufferGeometry, ShaderMaterial> = new Mesh(shimmerGeometry, glowMaterial(WARD_SHIMMER_VERTEX, WARD_SHIMMER_FRAGMENT, shimmerUniforms));
  shimmer.position.y = WARD.shimmerHeight / 2;
  shimmer.visible = !phone;
  const group: Group = new Group();
  group.add(ring, shimmer);
  group.visible = false;
  scene.add(group);
  let level: number = 0;
  let velocity: number = 0;
  let clock: number = 0;
  return {
    update(dt: number, world: World): void {
      const player = world.player;
      const target: number = player.alive && player.invulnerable > 0 ? 1 : 0;
      const step: number = Math.min(dt, 1 / 30);
      velocity += ((target - level) * WARD.stiffness - velocity * WARD.damping) * step;
      level += velocity * step;
      clock += dt;
      const visible: boolean = target > 0 || Math.abs(level) > WARD.rest;
      group.visible = visible;
      if (!visible) {
        level = 0;
        velocity = 0;
        return;
      }
      const strength: number = wardStrength(level, player.invulnerable, world.content.player.respawnInvulnerability, clock);
      group.position.set(player.pos.x, 0, player.pos.z);
      ringUniforms.uStrength.value = strength * WARD.ringAlpha;
      shimmerUniforms.uStrength.value = strength * WARD.shimmerAlpha;
      shimmerUniforms.uTime.value = clock * WARD.shimmerSpeed;
    },
  };
}
