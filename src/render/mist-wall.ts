import { Color, DoubleSide, Group, Mesh, PlaneGeometry, ShaderMaterial } from 'three';
import type { ZoneMistWall } from '../../sim/content/road-types.ts';
import { renderBudget } from '../mobile/quality.ts';

export const MIST_WALL = {
  layerStep: 1.3,
  color: 0x8e99a8,
  litColor: 0xe8eef8,
  opacity: 0.5,
  segments: 24,
  driftSpeed: 0.05,
  groundFeather: 0.22,
  topErode: 0.55,
  flashGain: 0.8,
  renderOrder: 2,
} as const;

const VERTEX: string = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT: string = `
uniform vec3 uColor;
uniform vec3 uLit;
uniform float uOpacity;
uniform float uTime;
uniform float uSeed;
uniform float uFlash;
uniform float uFeather;
uniform float uErode;
uniform float uGain;
uniform float uAspect;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float swirl(vec2 p) {
  return 0.65 * noise(p) + 0.35 * noise(p * 2.03 + vec2(1.7, 9.2));
}
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    amp *= 0.5;
  }
  return sum;
}
void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y * 2.0);
  vec2 warp = vec2(swirl(p * 0.7 + vec2(uTime, uSeed)), swirl(p * 0.7 + vec2(uSeed, -uTime)));
  float billow = fbm(p * 1.3 + warp * 1.8 + vec2(uTime * 0.6 + uSeed, -uTime * 0.3));
  float edge = uErode * (vUv.y + 0.15);
  float body = smoothstep(edge, edge + 0.35, billow);
  float ground = smoothstep(0.0, uFeather, vUv.y);
  float top = 1.0 - smoothstep(0.35, 1.0, vUv.y);
  float ends = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
  float alpha = uOpacity * body * ground * top * ends;
  vec3 colour = mix(uColor, uLit, clamp(uFlash * uGain + billow * 0.15, 0.0, 1.0));
  gl_FragColor = vec4(colour, alpha * (1.0 + uFlash * 0.6));
}
`;

export interface MistWallView {
  readonly group: Group;
  update(time: number, flash: number): void;
  dispose(): void;
}

export function mistWallFrame(wall: ZoneMistWall): { readonly length: number; readonly angle: number; readonly midX: number; readonly midZ: number; readonly outX: number; readonly outZ: number } {
  const dx: number = wall.to.x - wall.from.x;
  const dz: number = wall.to.z - wall.from.z;
  const length: number = Math.hypot(dx, dz);
  return { length, angle: -Math.atan2(dz, dx), midX: (wall.from.x + wall.to.x) / 2, midZ: (wall.from.z + wall.to.z) / 2, outX: length === 0 ? 0 : -dz / length, outZ: length === 0 ? 0 : dx / length };
}

export function buildMistWall(wall: ZoneMistWall): MistWallView {
  const frame = mistWallFrame(wall);
  const group: Group = new Group();
  const geometry: PlaneGeometry = new PlaneGeometry(frame.length, wall.height, MIST_WALL.segments, 1);
  const materials: ShaderMaterial[] = [];
  const layers: number = renderBudget().mistLayers;
  for (let layer: number = 0; layer < layers; layer += 1) {
    const material: ShaderMaterial = new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color(MIST_WALL.color) },
        uLit: { value: new Color(MIST_WALL.litColor) },
        uOpacity: { value: MIST_WALL.opacity * (1 - layer / (layers + 1)) },
        uTime: { value: 0 },
        uSeed: { value: layer * 3.7 },
        uFlash: { value: 0 },
        uFeather: { value: MIST_WALL.groundFeather },
        uErode: { value: MIST_WALL.topErode },
        uGain: { value: MIST_WALL.flashGain },
        uAspect: { value: wall.height === 0 ? 1 : frame.length / wall.height },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      fog: false,
    });
    materials.push(material);
    const mesh: Mesh = new Mesh(geometry, material);
    const out: number = layer * MIST_WALL.layerStep;
    mesh.position.set(frame.midX + frame.outX * out, wall.height / 2, frame.midZ + frame.outZ * out);
    mesh.rotation.y = frame.angle;
    mesh.renderOrder = MIST_WALL.renderOrder;
    group.add(mesh);
  }
  return {
    group,
    update(time: number, flash: number): void {
      for (const material of materials) {
        const drift = material.uniforms['uTime'];
        if (drift !== undefined) drift.value = time * MIST_WALL.driftSpeed;
        const lit = material.uniforms['uFlash'];
        if (lit !== undefined) lit.value = flash;
      }
    },
    dispose(): void {
      group.removeFromParent();
      geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
