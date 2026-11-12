import { Color, DoubleSide, Group, Mesh, PlaneGeometry, ShaderMaterial } from 'three';
import type { ZoneMistWall } from '../../sim/content/road-types.ts';

export const MIST_WALL = {
  layers: 4,
  layerStep: 1.6,
  color: 0xf1f3f5,
  opacity: 0.94,
  segments: 24,
  driftSpeed: 0.05,
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
uniform float uOpacity;
uniform float uTime;
uniform float uSeed;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  vec2 p = vec2(vUv.x * 7.0 + uTime + uSeed, vUv.y * 2.5 - uTime * 0.4);
  float billow = noise(p) * 0.6 + noise(p * 2.3) * 0.4;
  float rise = pow(1.0 - vUv.y, 1.4);
  float ends = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
  float alpha = uOpacity * rise * ends * mix(0.55, 1.0, billow);
  gl_FragColor = vec4(uColor, alpha);
}
`;

export interface MistWallView {
  readonly group: Group;
  update(time: number): void;
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
  for (let layer: number = 0; layer < MIST_WALL.layers; layer += 1) {
    const material: ShaderMaterial = new ShaderMaterial({
      uniforms: { uColor: { value: new Color(MIST_WALL.color) }, uOpacity: { value: MIST_WALL.opacity * (1 - layer / (MIST_WALL.layers + 1)) }, uTime: { value: 0 }, uSeed: { value: layer * 3.7 } },
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
    mesh.renderOrder = 2;
    group.add(mesh);
  }
  return {
    group,
    update(time: number): void {
      for (const material of materials) {
        const uniform = material.uniforms['uTime'];
        if (uniform !== undefined) uniform.value = time * MIST_WALL.driftSpeed;
      }
    },
    dispose(): void {
      group.removeFromParent();
      geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
