import type { Color, Material } from 'three';
import { AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CircleGeometry, CylinderGeometry, DoubleSide, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, Quaternion, RingGeometry, ShaderMaterial, Vector3 } from 'three';

export const SHAPES = {
  sectorSegments: 28,
  boltSegments: 9,
  boltHeight: 30,
  boltJitter: 1.5,
  boltWidth: 0.16,
  glowBoost: 3.2,
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

export function ringMesh(color: Color, inner: number): Mesh<RingGeometry, MeshBasicMaterial> {
  const mesh: Mesh<RingGeometry, MeshBasicMaterial> = new Mesh(new RingGeometry(inner, 1, 64), additive(color, 1));
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 7;
  return mesh;
}

export function discMesh(color: Color): Mesh<CircleGeometry, MeshBasicMaterial> {
  const mesh: Mesh<CircleGeometry, MeshBasicMaterial> = new Mesh(new CircleGeometry(1, 48), additive(color, 1));
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 6;
  return mesh;
}

export function telegraphMesh(arc: number, reach: number, color: Color): Mesh<BufferGeometry, MeshBasicMaterial> {
  const mesh: Mesh<BufferGeometry, MeshBasicMaterial> = new Mesh(sectorGeometry(arc, 0.35, reach), flat(color, 0.1));
  mesh.renderOrder = 5;
  return mesh;
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

export function lightningBolt(color: Color): Group {
  const group: Group = new Group();
  const material: MeshBasicMaterial = additive(glow(color, SHAPES.glowBoost * 1.6), 1);
  const up: Vector3 = new Vector3(0, 1, 0);
  let previous: Vector3 = new Vector3(0, 0, 0);
  for (let segment: number = 1; segment <= SHAPES.boltSegments; segment += 1) {
    const y: number = (segment / SHAPES.boltSegments) * SHAPES.boltHeight;
    const wander: number = segment === SHAPES.boltSegments ? 3 : 1;
    const next: Vector3 = new Vector3((Math.random() - 0.5) * SHAPES.boltJitter * wander, y, (Math.random() - 0.5) * SHAPES.boltJitter * wander);
    const span: Vector3 = next.clone().sub(previous);
    const length: number = span.length();
    const piece: Mesh = new Mesh(new BoxGeometry(SHAPES.boltWidth, 1, SHAPES.boltWidth), material);
    piece.scale.y = length;
    piece.position.copy(previous).addScaledVector(span, 0.5);
    piece.quaternion.copy(new Quaternion().setFromUnitVectors(up, span.normalize()));
    group.add(piece);
    previous = next;
  }
  group.renderOrder = 9;
  return group;
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
