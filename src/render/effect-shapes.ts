import type { Color, IUniform, Material } from 'three';
import { AdditiveBlending, BufferAttribute, BufferGeometry, CylinderGeometry, DoubleSide, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, NormalBlending, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import type { Delivery } from '../../sim/content/types.ts';
import { SKILLS } from '../../sim/world/skills.ts';
import type { GroundLight, GroundLightLook } from './ground-light.ts';
import { createGroundLight } from './ground-light.ts';

export const SHAPES = {
  sectorSegments: 28,
  lineStep: 0.7,
  dashLane: 0.6,
  boltSegments: 9,
  boltHeight: 30,
  boltJitter: 1.5,
  boltWidth: 0.16,
  glowBoost: 3.2,
  orbBoost: 1.5,
  orbCore: 0.22,
  orbHalo: 2.6,
  orbHaloBoost: 1.6,
  orbHaloStrength: 0.9,
  arcCount: 6,
  arcSegments: 6,
  arcJitter: 0.9,
  arcWidth: 0.09,
  telegraphWidth: 0.16,
  telegraphWidthMin: 0.3,
  telegraphWobble: 0.12,
  telegraphHollow: 0.6,
  telegraphGrain: 0.6,
  laneStart: 0.7,
} as const;

export const BLADE = {
  inner: 0.42,
  band: 0.82,
  width: 0.16,
  tailWidth: 0.25,
  trail: 0.7,
  lead: 1.4,
  front: 0.04,
  hot: 0.1,
  profile: 2.5,
  body: 0.9,
  heat: 1.6,
  whiten: 0.45,
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
  float head = uProgress * ${BLADE.lead.toFixed(2)};
  float behind = clamp((vArc.x - (head - ${BLADE.trail.toFixed(2)})) / ${BLADE.trail.toFixed(2)}, 0.0, 1.0);
  float front = 1.0 - smoothstep(head, head + ${BLADE.front.toFixed(2)}, vArc.x);
  float along = behind * behind * front;
  float width = ${BLADE.width.toFixed(2)} * mix(${BLADE.tailWidth.toFixed(2)}, 1.0, behind);
  float off = (vArc.y - ${BLADE.band.toFixed(2)}) / max(width, 0.001);
  float across = exp(-off * off * ${BLADE.profile.toFixed(2)});
  float hot = smoothstep(head - ${BLADE.hot.toFixed(2)}, head, vArc.x) * front;
  float alpha = along * across * uOpacity;
  vec3 tint = mix(uColor, vec3(1.0), hot * ${BLADE.whiten.toFixed(2)});
  gl_FragColor = vec4(tint * (${BLADE.body.toFixed(2)} + hot * ${BLADE.heat.toFixed(2)}) * alpha, alpha);
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
  const mesh: Mesh = new Mesh(sectorGeometry(arc, reach * BLADE.inner, reach), material);
  mesh.renderOrder = 8;
  return { mesh, material };
}

export function additive(color: Color, opacity: number): MeshBasicMaterial {
  return new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: DoubleSide, blending: AdditiveBlending });
}

export function flat(color: Color, opacity: number): MeshBasicMaterial {
  return new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: DoubleSide });
}

export interface Telegraph {
  readonly object: Group;
  readonly lights: readonly GroundLight[];
}

export function telegraphLook(reach: number): GroundLightLook {
  return { fill: 1, band: 0, width: Math.max(SHAPES.telegraphWidthMin, reach * SHAPES.telegraphWidth), wobble: reach * SHAPES.telegraphWobble, hollow: SHAPES.telegraphHollow, grain: SHAPES.telegraphGrain };
}

function ahead(light: GroundLight): GroundLight {
  light.mesh.rotation.z = Math.PI;
  return light;
}

function roundTelegraph(arc: number, inner: number, radius: number, color: Color): GroundLight {
  return ahead(createGroundLight(color, { kind: 'round', radius, inner, arc }, telegraphLook(radius)));
}

function laneTelegraph(halfWidth: number, length: number, color: Color): GroundLight {
  return ahead(createGroundLight(color, { kind: 'lane', halfWidth, start: SHAPES.laneStart, length: length - SHAPES.laneStart }, telegraphLook(halfWidth * 2)));
}

export function telegraphFor(delivery: Delivery, color: Color): Telegraph {
  const object: Group = new Group();
  const lights: GroundLight[] = [];
  switch (delivery.type) {
    case 'arc':
      lights.push(roundTelegraph((delivery.arcDegrees * Math.PI) / 180, 0, delivery.reach, color));
      break;
    case 'nova':
    case 'mark':
    case 'field':
    case 'area':
    case 'blink':
      lights.push(roundTelegraph(Math.PI * 2, 0, delivery.radius, color));
      break;
    case 'projectile': {
      const count: number = Math.max(1, Math.round(delivery.count));
      for (let index: number = 0; index < count; index += 1) {
        const lane: GroundLight = laneTelegraph(delivery.radius, delivery.range + SKILLS.projectileOrigin + delivery.radius, color);
        lane.mesh.rotation.z = Math.PI + (count === 1 ? 0 : ((index - (count - 1) / 2) * delivery.spreadDegrees * Math.PI) / 180);
        lights.push(lane);
      }
      break;
    }
    case 'dash':
      lights.push(laneTelegraph(SHAPES.dashLane, delivery.distance, color));
      break;
    case 'beam':
      lights.push(laneTelegraph(delivery.width / 2, delivery.range, color));
      break;
    case 'chain':
      lights.push(roundTelegraph(Math.PI * 2, 0, delivery.range, color));
      break;
    case 'revive':
      break;
  }
  for (const light of lights) object.add(light.mesh);
  return { object, lights };
}

export function pillarMesh(color: Color, radius: number, height: number): Mesh<CylinderGeometry, MeshBasicMaterial> {
  const mesh: Mesh<CylinderGeometry, MeshBasicMaterial> = new Mesh(new CylinderGeometry(radius, radius, height, 24, 1, true), additive(color, 1));
  mesh.position.y = height / 2;
  mesh.renderOrder = 7;
  return mesh;
}

export const ORB_HALO_VERTEX: string = ['varying float vFacing;', 'void main() {', '  vec4 seen = modelViewMatrix * vec4(position, 1.0);', '  vFacing = abs(dot(normalize(normalMatrix * normal), normalize(-seen.xyz)));', '  gl_Position = projectionMatrix * seen;', '}'].join('\n');

export const ORB_HALO_FRAGMENT: string = ['uniform vec3 uColor;', 'uniform float uStrength;', 'varying float vFacing;', 'void main() {', '  float soft = vFacing * vFacing * vFacing;', '  gl_FragColor = vec4(uColor * soft * uStrength, 1.0);', '}'].join('\n');

function orbHalo(color: Color): Mesh<IcosahedronGeometry, ShaderMaterial> {
  const halo: Mesh<IcosahedronGeometry, ShaderMaterial> = new Mesh(
    new IcosahedronGeometry(1, 2),
    new ShaderMaterial({ vertexShader: ORB_HALO_VERTEX, fragmentShader: ORB_HALO_FRAGMENT, uniforms: { uColor: { value: glow(color, SHAPES.orbHaloBoost) }, uStrength: { value: SHAPES.orbHaloStrength } }, transparent: true, depthWrite: false, blending: AdditiveBlending }),
  );
  halo.scale.setScalar(SHAPES.orbHalo);
  return halo;
}

export function projectileMesh(style: 'bolt' | 'orb', color: Color): Mesh<IcosahedronGeometry, MeshBasicMaterial> {
  const mesh: Mesh<IcosahedronGeometry, MeshBasicMaterial> = new Mesh(new IcosahedronGeometry(1, 1), new MeshBasicMaterial({ color: glow(color, style === 'orb' ? SHAPES.orbBoost : SHAPES.glowBoost) }));
  if (style === 'bolt') mesh.scale.set(0.2, 0.2, 1.05);
  else {
    mesh.scale.setScalar(SHAPES.orbCore);
    mesh.add(orbHalo(color));
  }
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

export function programKeepers(color: Color): Mesh[] {
  const bare: BufferGeometry = new BufferGeometry();
  bare.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
  return [createGroundLight(color, { kind: 'round', radius: 1, inner: 0, arc: Math.PI * 2 }, { fill: 1, band: 1, width: 0.2, wobble: 0.1 }).mesh, scorchMesh(color).mesh, slashMesh(1, 1, color).mesh, new Mesh(bare, additive(color, 0)), new Mesh(bare, flat(color, 0)), projectileMesh('orb', color), pillarMesh(color, 1, 1)];
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
