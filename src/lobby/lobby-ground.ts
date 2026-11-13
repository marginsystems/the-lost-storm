import { BufferAttribute, BufferGeometry } from 'three';

export const LOBBY_GROUND = {
  radius: 16,
  rings: 56,
  spokes: 112,
  ringEase: 1.6,
  padFlat: 1.5,
  padBlend: 2.6,
  swellHeight: 0.2,
  swellMetres: 4.6,
  rippleHeight: 0.05,
  rippleMetres: 1.5,
  riseFrom: 4.5,
  riseTo: 13,
  riseHeight: 1.05,
  riseFront: 0.6,
  riseMetres: 6.2,
  moundHeight: 0.26,
  moundReach: 1.5,
  rockSink: 0.2,
  edgeShade: 0.06,
  octaves: 3,
} as const;

export interface Mound {
  readonly x: number;
  readonly z: number;
  readonly size: number;
}

function smooth(value: number): number {
  const t: number = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

function lattice(x: number, z: number): number {
  const mixed: number = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return mixed - Math.floor(mixed);
}

export function valueNoise(x: number, z: number): number {
  const cellX: number = Math.floor(x);
  const cellZ: number = Math.floor(z);
  const u: number = smooth(x - cellX);
  const v: number = smooth(z - cellZ);
  const near: number = lattice(cellX, cellZ) + (lattice(cellX + 1, cellZ) - lattice(cellX, cellZ)) * u;
  const far: number = lattice(cellX, cellZ + 1) + (lattice(cellX + 1, cellZ + 1) - lattice(cellX, cellZ + 1)) * u;
  return near + (far - near) * v;
}

function rolling(x: number, z: number): number {
  let sum: number = 0;
  let weight: number = 0.5;
  let scale: number = 1;
  let total: number = 0;
  for (let octave: number = 0; octave < LOBBY_GROUND.octaves; octave += 1) {
    sum += weight * valueNoise(x * scale + octave * 17.3, z * scale + octave * 9.1);
    total += weight;
    weight *= 0.5;
    scale *= 2.03;
  }
  return sum / total;
}

export function groundHeight(x: number, z: number, mounds: readonly Mound[]): number {
  const spec = LOBBY_GROUND;
  const reach: number = Math.hypot(x, z);
  const open: number = smooth((reach - spec.padFlat) / spec.padBlend);
  if (open <= 0) return 0;
  const swell: number = (rolling(x / spec.swellMetres, z / spec.swellMetres) - 0.5) * 2 * spec.swellHeight;
  const ripple: number = (valueNoise(x / spec.rippleMetres + 31, z / spec.rippleMetres + 7) - 0.5) * 2 * spec.rippleHeight;
  const far: number = smooth((reach - spec.riseFrom) / (spec.riseTo - spec.riseFrom));
  const behind: number = spec.riseFront + (1 - spec.riseFront) * smooth(0.5 - z / (2 * spec.riseFrom));
  const ridge: number = far * far * spec.riseHeight * behind * (0.45 + 1.1 * rolling(x / spec.riseMetres + 5, z / spec.riseMetres + 13));
  let height: number = swell + ripple + ridge;
  for (const mound of mounds) {
    const spread: number = spec.moundReach * mound.size;
    const gap: number = Math.hypot(x - mound.x, z - mound.z) / spread;
    height += spec.moundHeight * mound.size * Math.exp(-gap * gap);
  }
  return open * height;
}

export function rockHeight(rock: Mound, mounds: readonly Mound[]): number {
  return groundHeight(rock.x, rock.z, mounds) - LOBBY_GROUND.rockSink * rock.size;
}

export function groundGeometry(mounds: readonly Mound[]): BufferGeometry {
  const spec = LOBBY_GROUND;
  const perRing: number = spec.spokes + 1;
  const count: number = 1 + spec.rings * perRing;
  const positions: Float32Array = new Float32Array(count * 3);
  const uvs: Float32Array = new Float32Array(count * 2);
  const colours: Float32Array = new Float32Array(count * 3);
  const place = (index: number, x: number, z: number): void => {
    positions.set([x, groundHeight(x, z, mounds), z], index * 3);
    uvs.set([x / (2 * spec.radius) + 0.5, 0.5 - z / (2 * spec.radius)], index * 2);
    const reach: number = Math.hypot(x, z) / spec.radius;
    const shade: number = spec.edgeShade + (1 - spec.edgeShade) * Math.max(0, 1 - reach * reach);
    colours.set([shade, shade, shade], index * 3);
  };
  place(0, 0, 0);
  for (let ring: number = 1; ring <= spec.rings; ring += 1) {
    const radius: number = spec.radius * (ring / spec.rings) ** spec.ringEase;
    for (let spoke: number = 0; spoke <= spec.spokes; spoke += 1) {
      const angle: number = (spoke / spec.spokes) * Math.PI * 2;
      place(1 + (ring - 1) * perRing + spoke, Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
  }
  const indices: number[] = [];
  for (let spoke: number = 0; spoke < spec.spokes; spoke += 1) indices.push(0, 2 + spoke, 1 + spoke);
  for (let ring: number = 1; ring < spec.rings; ring += 1) {
    const inner: number = 1 + (ring - 1) * perRing;
    const outer: number = inner + perRing;
    for (let spoke: number = 0; spoke < spec.spokes; spoke += 1) {
      indices.push(inner + spoke, inner + spoke + 1, outer + spoke);
      indices.push(inner + spoke + 1, outer + spoke + 1, outer + spoke);
    }
  }
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
