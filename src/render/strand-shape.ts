export const STRAND = {
  trunkPoints: 20,
  forkPoints: 5,
  maxForks: 2,
  step: 0.6,
  wander: 0.3,
  sideShare: 0.6,
  forkFrom: 0.2,
  forkSpan: 0.55,
  forkReach: 0.32,
  forkReachMax: 1.5,
  forkTurn: 0.75,
  forkWeight: 0.65,
  lead: 0.05,
  strikeFall: 0.22,
  afterimage: 0.4,
  restrikeAt: 0.42,
  restrikeWidth: 0.1,
  restrike: 0.45,
} as const;

export const STRAND_POINTS: number = STRAND.trunkPoints + STRAND.maxForks * STRAND.forkPoints;

export interface StrandEnds {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface StrandForm {
  readonly forks: number;
  readonly jitter: number;
}

export interface StrandBuffers {
  readonly points: Float32Array;
  readonly weights: Float32Array;
}

export function createStrandBuffers(): StrandBuffers {
  return { points: new Float32Array(STRAND_POINTS * 3), weights: new Float32Array(STRAND_POINTS) };
}

export function strandStrips(): readonly (readonly [number, number])[] {
  const strips: [number, number][] = [[0, STRAND.trunkPoints]];
  for (let fork: number = 0; fork < STRAND.maxForks; fork += 1) strips.push([STRAND.trunkPoints + fork * STRAND.forkPoints, STRAND.forkPoints]);
  return strips;
}

function smooth(t: number): number {
  const clamped: number = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

function put(out: StrandBuffers, index: number, x: number, y: number, z: number, weight: number): void {
  out.points[index * 3] = x;
  out.points[index * 3 + 1] = y;
  out.points[index * 3 + 2] = z;
  out.weights[index] = weight;
}

export function writeStrand(from: StrandEnds, to: StrandEnds, form: StrandForm, random: () => number, out: StrandBuffers): number {
  const dx: number = to.x - from.x;
  const dy: number = to.y - from.y;
  const dz: number = to.z - from.z;
  const length: number = Math.max(1e-4, Math.hypot(dx, dy, dz));
  const ax: number = dx / length;
  const ay: number = dy / length;
  const az: number = dz / length;
  const flat: number = Math.hypot(ax, az);
  const sx: number = flat > 1e-3 ? az / flat : 1;
  const sz: number = flat > 1e-3 ? -ax / flat : 0;
  const ux: number = ay * sz;
  const uy: number = az * sx - ax * sz;
  const uz: number = -ay * sx;
  const steps: number = Math.min(STRAND.trunkPoints - 1, Math.max(2, Math.ceil(length / STRAND.step)));
  let side: number = 0;
  let rise: number = 0;
  for (let point: number = 0; point < STRAND.trunkPoints; point += 1) {
    const at: number = Math.min(point, steps);
    const t: number = at / steps;
    side = side * STRAND.wander + (random() - 0.5) * 2 * (1 - STRAND.wander);
    rise = rise * STRAND.wander + (random() - 0.5) * 2 * (1 - STRAND.wander);
    const envelope: number = Math.sin(Math.PI * t) * form.jitter;
    const offset: number = side * envelope;
    const lift: number = rise * envelope * STRAND.sideShare;
    put(out, point, from.x + dx * t + sx * offset + ux * lift, from.y + dy * t + uy * lift, from.z + dz * t + sz * offset + uz * lift, point <= steps ? 1 : 0);
  }
  const forks: number = Math.max(0, Math.min(STRAND.maxForks, Math.floor(form.forks)));
  const reach: number = Math.min(length * STRAND.forkReach, STRAND.forkReachMax);
  for (let fork: number = 0; fork < STRAND.maxForks; fork += 1) {
    const base: number = STRAND.trunkPoints + fork * STRAND.forkPoints;
    const root: number = Math.min(steps - 1, Math.max(1, Math.floor(steps * (STRAND.forkFrom + STRAND.forkSpan * random()))));
    const rx: number = out.points[root * 3] ?? from.x;
    const ry: number = out.points[root * 3 + 1] ?? from.y;
    const rz: number = out.points[root * 3 + 2] ?? from.z;
    const turn: number = STRAND.forkTurn * (0.6 + 0.4 * random()) * (random() < 0.5 ? -1 : 1);
    const tilt: number = (random() - 0.5) * STRAND.forkTurn;
    const fx: number = ax * Math.cos(turn) + sx * Math.sin(turn) + ux * tilt;
    const fy: number = ay * Math.cos(turn) + uy * tilt;
    const fz: number = az * Math.cos(turn) + sz * Math.sin(turn) + uz * tilt;
    const norm: number = Math.max(1e-4, Math.hypot(fx, fy, fz));
    for (let point: number = 0; point < STRAND.forkPoints; point += 1) {
      const t: number = point / (STRAND.forkPoints - 1);
      const wiggle: number = (random() - 0.5) * form.jitter * t;
      const drawn: boolean = fork < forks;
      put(out, base + point, rx + (fx / norm) * reach * t + sx * wiggle, ry + (fy / norm) * reach * t, rz + (fz / norm) * reach * t + sz * wiggle, drawn ? STRAND.forkWeight * (1 - t) : 0);
    }
  }
  return forks;
}

export interface Dice {
  reset(seed: number): void;
  readonly next: () => number;
}

export function createDice(): Dice {
  let state: number = 1;
  return {
    reset(seed: number): void {
      state = (Math.floor(Math.abs(seed) * 2147483646) % 2147483646) + 1;
    },
    next: (): number => {
      state = (state * 16807) % 2147483647;
      return (state - 1) / 2147483646;
    },
  };
}

export function strandSpan(afterglow: number): number {
  return STRAND.lead + afterglow;
}

export function strandLight(age: number, afterglow: number, restrike: boolean): number {
  if (!(age > 0) || age >= strandSpan(afterglow)) return 0;
  if (age < STRAND.lead) return smooth(age / STRAND.lead);
  const since: number = (age - STRAND.lead) / afterglow;
  const strike: number = STRAND.afterimage + (1 - STRAND.afterimage) * Math.exp(-since / STRAND.strikeFall);
  const off: number = (since - STRAND.restrikeAt) / STRAND.restrikeWidth;
  const again: number = restrike ? STRAND.restrike * Math.exp(-off * off) : 0;
  return Math.min(1, strike + again) * (1 - smooth(since));
}
