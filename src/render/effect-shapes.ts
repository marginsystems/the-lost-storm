import type { Color, IUniform, Material } from 'three';
import { AdditiveBlending, BufferAttribute, BufferGeometry, CylinderGeometry, DoubleSide, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, NormalBlending, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import type { Delivery } from '../../sim/content/types.ts';
import { SKILLS } from '../../sim/world/skills.ts';

export const SHAPES = {
  sectorSegments: 28,
  lineStep: 0.7,
  dashLane: 0.6,
  boltSegments: 9,
  boltHeight: 30,
  boltJitter: 1.5,
  boltWidth: 0.16,
  glowBoost: 3.2,
  arcCount: 6,
  arcSegments: 6,
  arcJitter: 0.9,
  arcWidth: 0.09,
  telegraphInner: 0.35,
  telegraphEdge: 0.965,
  telegraphFill: 0.1,
  telegraphLine: 0.42,
  laneStart: 0.7,
} as const;

const ARC_VERTEX: string = `
attribute vec2 arc;
varying vec2 vArc;
void main() {
  vArc = arc;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SLASH_FRAGMENT: string = `
uniform vec3 uColor;
uniform float uProgress;
uniform float uOpacity;
varying vec2 vArc;
void main() {
  float head = uProgress * 1.4;
  float trail = smoothstep(head - 0.6, head, vArc.x) * (1.0 - smoothstep(head, head + 0.05, vArc.x));
  float edge = smoothstep(0.0, 0.6, vArc.y) * (1.0 - smoothstep(0.88, 1.0, vArc.y));
  float alpha = trail * edge * uOpacity;
  gl_FragColor = vec4(uColor * (1.0 + trail * 2.5) * alpha, alpha);
}
`;

const PLANE_VERTEX: string = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const NOISE: string = `
varying vec2 vUv;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  return noise(p) * 0.55 + noise(p * 2.1) * 0.3 + noise(p * 4.3) * 0.15;
}
`;

const SHOCKWAVE_FRAGMENT: string = `
uniform vec3 uColor;
uniform float uProgress;
uniform float uSeed;
uniform float uTrail;
uniform float uDetail;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  vec2 dir = p / max(r, 0.0001);
  float eased = 1.0 - pow(max(1.0 - uProgress, 0.0), 3.0);
  float wobble = (fbm(dir * 2.3 + uSeed) - 0.5) * 0.18;
  float front = eased * 0.84 + wobble * uProgress;
  float lead = 1.0 - smoothstep(front, front + 0.04, r);
  float trail = smoothstep(front - uTrail, front, r);
  float band = lead * trail * trail;
  float streak = 0.4 + 0.6 * fbm(dir * 7.0 + vec2(r * 5.0 - uProgress * 3.0, uSeed));
  float veins = pow(max(fbm(dir * 12.0 + vec2(uSeed * 3.1, r * 2.0)), 0.0), 6.0) * 14.0;
  float inside = lead * smoothstep(0.06, 0.3, r);
  float core = (1.0 - smoothstep(0.0, 0.3, r)) * (1.0 - uProgress) * 0.28;
  float fade = (1.0 - uProgress) * (1.0 - uProgress);
  float alpha = (band * streak * 1.25 + (veins * inside * 0.16 + core) * uDetail) * fade;
  alpha *= 1.0 - smoothstep(0.9, 1.0, r);
  gl_FragColor = vec4(uColor * (0.7 + band * 0.9), clamp(alpha, 0.0, 1.0));
}
`;

const MARKER_FRAGMENT: string = `
uniform vec3 uColor;
uniform float uProgress;
uniform float uSeed;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  vec2 dir = p / max(r, 0.0001);
  float eased = 1.0 - pow(max(1.0 - uProgress, 0.0), 2.0);
  float radius = mix(0.78, 0.3, eased);
  float ring = smoothstep(radius - 0.2, radius, r) * (1.0 - smoothstep(radius, radius + 0.12, r));
  float broken = 0.25 + 0.75 * smoothstep(0.38, 0.62, fbm(dir * 2.6 + vec2(uSeed, uProgress * 1.5)));
  float haze = (1.0 - smoothstep(0.0, 0.55, r)) * 0.22;
  float fade = 1.0 - uProgress;
  float alpha = (ring * broken * 0.7 + haze) * fade;
  gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 1.0));
}
`;

const SCORCH_FRAGMENT: string = `
uniform vec3 uColor;
uniform float uFade;
uniform float uSeed;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  vec2 dir = p / max(r, 0.0001);
  float edge = 0.7 + (fbm(dir * 3.0 + uSeed) - 0.5) * 0.4;
  float burn = 1.0 - smoothstep(edge * 0.35, edge, r);
  float soot = burn * (0.5 + 0.5 * fbm(p * 6.0 + uSeed));
  float crack = pow(max(1.0 - abs(fbm(dir * 6.0 + vec2(uSeed, r * 1.5)) - 0.5) * 7.0, 0.0), 3.0);
  float ember = crack * burn * smoothstep(0.08, 0.4, r) * uFade * uFade * uFade;
  vec3 color = mix(vec3(0.015, 0.015, 0.02), uColor * 3.0, clamp(ember, 0.0, 1.0));
  float alpha = clamp(soot * 0.62 * uFade + ember * 0.8, 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}
`;

export function glow(color: Color, boost: number): Color {
  return color.clone().multiplyScalar(boost);
}

export function sectorGeometry(arc: number, inner: number, outer: number): BufferGeometry {
  const segments: number = SHAPES.sectorSegments;
  const positions: number[] = [];
  const arcs: number[] = [];
  const indices: number[] = [];
  for (let step: number = 0; step <= segments; step += 1) {
    const t: number = step / segments;
    const angle: number = (t - 0.5) * arc;
    const sin: number = Math.sin(angle);
    const cos: number = Math.cos(angle);
    positions.push(sin * inner, 0, cos * inner, sin * outer, 0, cos * outer);
    arcs.push(t, 0, t, 1);
    if (step < segments) {
      const base: number = step * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('arc', new BufferAttribute(new Float32Array(arcs), 2));
  geometry.setIndex(indices);
  return geometry;
}

export interface SlashMesh {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
}

export function slashMesh(arc: number, reach: number, color: Color): SlashMesh {
  const material: ShaderMaterial = new ShaderMaterial({
    vertexShader: ARC_VERTEX,
    fragmentShader: SLASH_FRAGMENT,
    uniforms: { uColor: { value: color.clone() }, uProgress: { value: 0 }, uOpacity: { value: 1 } },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  });
  const mesh: Mesh = new Mesh(sectorGeometry(arc, reach * 0.42, reach), material);
  mesh.renderOrder = 8;
  return { mesh, material };
}

export function additive(color: Color, opacity: number): MeshBasicMaterial {
  return new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: DoubleSide, blending: AdditiveBlending });
}

export function flat(color: Color, opacity: number): MeshBasicMaterial {
  return new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: DoubleSide });
}

export type TelegraphPart = Mesh<BufferGeometry, MeshBasicMaterial>;

export interface Telegraph {
  readonly object: Group;
  readonly fills: readonly TelegraphPart[];
  readonly edges: readonly TelegraphPart[];
  readonly lanes: boolean;
}

function telegraphPart(geometry: BufferGeometry, color: Color, opacity: number, order: number): TelegraphPart {
  const mesh: TelegraphPart = new Mesh(geometry, flat(color, opacity));
  mesh.renderOrder = order;
  return mesh;
}

function laneGeometry(halfWidth: number, length: number): BufferGeometry {
  const geometry: BufferGeometry = new BufferGeometry();
  const near: number = SHAPES.laneStart;
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-halfWidth, 0, near, halfWidth, 0, near, -halfWidth, 0, length, halfWidth, 0, length]), 3));
  geometry.setIndex([0, 1, 2, 1, 3, 2]);
  return geometry;
}

export function telegraphFor(delivery: Delivery, color: Color): Telegraph {
  const object: Group = new Group();
  const fills: TelegraphPart[] = [];
  const edges: TelegraphPart[] = [];
  switch (delivery.type) {
    case 'arc': {
      const arc: number = (delivery.arcDegrees * Math.PI) / 180;
      fills.push(telegraphPart(sectorGeometry(arc, SHAPES.telegraphInner, delivery.reach), color, SHAPES.telegraphFill, 5));
      edges.push(telegraphPart(sectorGeometry(arc, delivery.reach * SHAPES.telegraphEdge, delivery.reach), color, SHAPES.telegraphLine, 6));
      break;
    }
    case 'nova':
    case 'mark':
    case 'field':
    case 'blink':
      fills.push(telegraphPart(sectorGeometry(Math.PI * 2, 0, delivery.radius), color, SHAPES.telegraphFill, 5));
      edges.push(telegraphPart(sectorGeometry(Math.PI * 2, delivery.radius * SHAPES.telegraphEdge, delivery.radius), color, SHAPES.telegraphLine, 6));
      break;
    case 'projectile': {
      const count: number = Math.max(1, Math.round(delivery.count));
      for (let index: number = 0; index < count; index += 1) {
        const lane: TelegraphPart = telegraphPart(laneGeometry(delivery.radius, delivery.range + SKILLS.projectileOrigin + delivery.radius), color, SHAPES.telegraphFill, 5);
        lane.rotation.y = count === 1 ? 0 : ((index - (count - 1) / 2) * delivery.spreadDegrees * Math.PI) / 180;
        fills.push(lane);
      }
      break;
    }
    case 'dash':
      fills.push(telegraphPart(laneGeometry(SHAPES.dashLane, delivery.distance), color, SHAPES.telegraphFill, 5));
      break;
    case 'beam':
      fills.push(telegraphPart(laneGeometry(delivery.width / 2, delivery.range), color, SHAPES.telegraphFill, 5));
      break;
    case 'chain':
      fills.push(telegraphPart(sectorGeometry(Math.PI * 2, 0, delivery.range), color, SHAPES.telegraphFill, 5));
      edges.push(telegraphPart(sectorGeometry(Math.PI * 2, delivery.range * SHAPES.telegraphEdge, delivery.range), color, SHAPES.telegraphLine, 6));
      break;
  }
  for (const part of [...fills, ...edges]) object.add(part);
  return { object, fills, edges, lanes: delivery.type === 'projectile' || delivery.type === 'dash' || delivery.type === 'beam' };
}

export function pillarMesh(color: Color, radius: number, height: number): Mesh<CylinderGeometry, MeshBasicMaterial> {
  const mesh: Mesh<CylinderGeometry, MeshBasicMaterial> = new Mesh(new CylinderGeometry(radius, radius, height, 24, 1, true), additive(color, 1));
  mesh.position.y = height / 2;
  mesh.renderOrder = 7;
  return mesh;
}

export function projectileMesh(style: 'bolt' | 'orb', color: Color): Mesh<IcosahedronGeometry, MeshBasicMaterial> {
  const mesh: Mesh<IcosahedronGeometry, MeshBasicMaterial> = new Mesh(new IcosahedronGeometry(1, 1), new MeshBasicMaterial({ color: glow(color, SHAPES.glowBoost) }));
  if (style === 'bolt') mesh.scale.set(0.2, 0.2, 1.05);
  else mesh.scale.setScalar(0.34);
  return mesh;
}

export interface ShaderPlane {
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  readonly material: ShaderMaterial;
}

function groundPlane(fragmentShader: string, uniforms: Record<string, IUniform>, additiveBlend: boolean, order: number): ShaderPlane {
  const material: ShaderMaterial = new ShaderMaterial({
    vertexShader: PLANE_VERTEX,
    fragmentShader: `${NOISE}${fragmentShader}`,
    uniforms,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: additiveBlend ? AdditiveBlending : NormalBlending,
  });
  const mesh: Mesh<PlaneGeometry, ShaderMaterial> = new Mesh(new PlaneGeometry(2, 2), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = order;
  return { mesh, material };
}

export function shockwaveMesh(color: Color, trail: number, detail: number): ShaderPlane {
  return groundPlane(SHOCKWAVE_FRAGMENT, { uColor: { value: color.clone() }, uProgress: { value: 0 }, uSeed: { value: Math.random() * 40 }, uTrail: { value: trail }, uDetail: { value: detail } }, true, 7);
}

export function markerMesh(color: Color): ShaderPlane {
  return groundPlane(MARKER_FRAGMENT, { uColor: { value: color.clone() }, uProgress: { value: 0 }, uSeed: { value: Math.random() * 40 } }, true, 6);
}

export function scorchMesh(color: Color): ShaderPlane {
  return groundPlane(SCORCH_FRAGMENT, { uColor: { value: color.clone() }, uFade: { value: 1 }, uSeed: { value: Math.random() * 40 } }, false, 4);
}

function ribbon(points: readonly Vector3[], width: number, flatOnGround: boolean, positions: number[], indices: number[]): void {
  const up: Vector3 = new Vector3(0, 1, 0);
  const along: Vector3 = new Vector3();
  const side: Vector3 = new Vector3();
  const other: Vector3 = new Vector3();
  for (let index: number = 0; index + 1 < points.length; index += 1) {
    const from: Vector3 | undefined = points[index];
    const to: Vector3 | undefined = points[index + 1];
    if (from === undefined || to === undefined) continue;
    along.subVectors(to, from).normalize();
    side.crossVectors(along, flatOnGround ? up : new Vector3(1, 0, 0)).normalize().multiplyScalar(width / 2);
    other.crossVectors(along, side).normalize().multiplyScalar(width / 2);
    const blades: readonly Vector3[] = flatOnGround ? [side] : [side, other];
    for (const blade of blades) {
      const base: number = positions.length / 3;
      positions.push(from.x - blade.x, from.y - blade.y, from.z - blade.z, from.x + blade.x, from.y + blade.y, from.z + blade.z, to.x - blade.x, to.y - blade.y, to.z - blade.z, to.x + blade.x, to.y + blade.y, to.z + blade.z);
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }
}

function ribbonMesh(positions: number[], indices: number[], color: Color, order: number): Mesh<BufferGeometry, MeshBasicMaterial> {
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  const mesh: Mesh<BufferGeometry, MeshBasicMaterial> = new Mesh(geometry, additive(color, 1));
  mesh.renderOrder = order;
  mesh.frustumCulled = false;
  return mesh;
}

export function skyBolt(color: Color): Mesh<BufferGeometry, MeshBasicMaterial> {
  const points: Vector3[] = [new Vector3(0, 0, 0)];
  for (let segment: number = 1; segment <= SHAPES.boltSegments; segment += 1) {
    const wander: number = segment === SHAPES.boltSegments ? 3 : 1;
    points.push(new Vector3((Math.random() - 0.5) * SHAPES.boltJitter * wander, (segment / SHAPES.boltSegments) * SHAPES.boltHeight, (Math.random() - 0.5) * SHAPES.boltJitter * wander));
  }
  const positions: number[] = [];
  const indices: number[] = [];
  ribbon(points, SHAPES.boltWidth, false, positions, indices);
  return ribbonMesh(positions, indices, glow(color, SHAPES.glowBoost * 1.6), 9);
}

export function lightningLine(from: Vector3, to: Vector3, color: Color, jitter: number, width: number): Mesh<BufferGeometry, MeshBasicMaterial> {
  const length: number = from.distanceTo(to);
  const steps: number = Math.max(2, Math.ceil(length / SHAPES.lineStep));
  const points: Vector3[] = [];
  for (let step: number = 0; step <= steps; step += 1) {
    const t: number = step / steps;
    const sway: number = step === 0 || step === steps ? 0 : jitter;
    points.push(new Vector3().lerpVectors(from, to, t).add(new Vector3((Math.random() - 0.5) * sway, (Math.random() - 0.5) * sway * 0.6, (Math.random() - 0.5) * sway)));
  }
  const positions: number[] = [];
  const indices: number[] = [];
  ribbon(points, width, false, positions, indices);
  return ribbonMesh(positions, indices, glow(color, SHAPES.glowBoost * 1.4), 9);
}

export function discMesh(color: Color, radius: number, opacity: number): Mesh<BufferGeometry, MeshBasicMaterial> {
  const mesh: Mesh<BufferGeometry, MeshBasicMaterial> = new Mesh(sectorGeometry(Math.PI * 2, 0, radius), additive(color, opacity));
  mesh.renderOrder = 4;
  return mesh;
}

export function groundArcs(color: Color, radius: number): Mesh<BufferGeometry, MeshBasicMaterial> {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let arc: number = 0; arc < SHAPES.arcCount; arc += 1) {
    const heading: number = ((arc + Math.random() * 0.7) / SHAPES.arcCount) * Math.PI * 2;
    const reach: number = radius * (0.55 + Math.random() * 0.4);
    const points: Vector3[] = [];
    for (let step: number = 0; step <= SHAPES.arcSegments; step += 1) {
      const t: number = step / SHAPES.arcSegments;
      const sway: number = step === 0 ? 0 : (Math.random() - 0.5) * SHAPES.arcJitter;
      const angle: number = heading + sway / Math.max(0.6, t * reach);
      points.push(new Vector3(Math.sin(angle) * (0.5 + t * reach), 0, Math.cos(angle) * (0.5 + t * reach)));
    }
    ribbon(points, SHAPES.arcWidth, true, positions, indices);
  }
  return ribbonMesh(positions, indices, glow(color, SHAPES.glowBoost * 1.3), 8);
}

export function disposeObject(object: Mesh | Group): void {
  object.traverse((child): void => {
    if (!(child instanceof Mesh)) return;
    const geometry: unknown = child.geometry;
    const material: unknown = child.material;
    if (geometry instanceof BufferGeometry) geometry.dispose();
    const materials: readonly unknown[] = Array.isArray(material) ? material : [material];
    for (const entry of materials) {
      const candidate: unknown = entry;
      if (isMaterial(candidate)) candidate.dispose();
    }
  });
  object.removeFromParent();
}

function isMaterial(value: unknown): value is Material {
  return typeof value === 'object' && value !== null && 'isMaterial' in value;
}
