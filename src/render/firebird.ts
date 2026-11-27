import { AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial } from 'three';

type Point = readonly [number, number, number];

const PLUMAGE = {
  beak: [0, 0.06, 0.65],
  crown: [0, 0.19, 0.31],
  breast: [0, -0.12, 0.12],
  rump: [0, 0.08, -0.54],
  cream: '#ffdf8b',
  gold: '#ffad38',
  ember: '#f46119',
  coal: '#c5450f',
  tip: '#f73d0e',
  tipFade: 0.76,
  hinge: 0.16,
  downstroke: 0.85,
  wingbeat: 21,
} as const;

export function firebirdMesh(): Mesh {
  const positions: number[] = [];
  const folded: number[] = [];
  const colors: number[] = [];
  const tipColor: Color = new Color(PLUMAGE.tip);
  const face = (a: Point, b: Point, c: Point, tint: string): void => {
    for (const [x, y, z] of [a, b, c]) {
      const edge: number = Math.min(1, Math.max(Math.abs(x), -z));
      const color: Color = new Color(tint).lerp(tipColor, edge * edge);
      positions.push(x, y, z);
      folded.push(x, y - Math.max(0, Math.abs(x) - PLUMAGE.hinge) * PLUMAGE.downstroke, z);
      colors.push(color.r, color.g, color.b, 1 - PLUMAGE.tipFade * edge * edge);
    }
  };
  for (const side of [-1, 1]) {
    const shoulder: Point = [side * 0.15, 0.05, 0.22];
    const hip: Point = [side * 0.12, 0, -0.37];
    const wrist: Point = [side * 0.68, 0.38, 0.18];
    const elbow: Point = [side * 0.48, 0.21, -0.23];
    const tip: Point = [side * 1.14, 0.57, -0.52];
    const feather: Point = [side * 0.77, 0.36, -0.48];
    const innerFeather: Point = [side * 0.57, 0.25, -0.58];
    const tail: Point = [side * 0.32, 0.04, -0.95];
    face(PLUMAGE.beak, shoulder, PLUMAGE.crown, PLUMAGE.cream);
    face(PLUMAGE.beak, PLUMAGE.breast, shoulder, PLUMAGE.gold);
    face(PLUMAGE.crown, shoulder, PLUMAGE.rump, PLUMAGE.gold);
    face(shoulder, hip, PLUMAGE.rump, PLUMAGE.ember);
    face(shoulder, PLUMAGE.breast, hip, PLUMAGE.coal);
    face(shoulder, wrist, elbow, PLUMAGE.gold);
    face(shoulder, elbow, hip, PLUMAGE.ember);
    face(wrist, tip, elbow, PLUMAGE.cream);
    face(elbow, tip, feather, PLUMAGE.ember);
    face(shoulder, elbow, innerFeather, PLUMAGE.ember);
    face(hip, tail, PLUMAGE.rump, PLUMAGE.gold);
  }
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 4));
  geometry.morphAttributes.position = [new Float32BufferAttribute(folded, 3)];
  return new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, forceSinglePass: true }));
}

export function beatWings(mesh: Mesh, elapsed: number, phase: number): void {
  if (mesh.morphTargetInfluences !== undefined) mesh.morphTargetInfluences[0] = (1 + Math.sin(elapsed * PLUMAGE.wingbeat + phase)) / 2;
}
