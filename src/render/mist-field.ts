import type { Vec2 } from '../../sim/math.ts';

export const MIST = {
  span: 56,
  edgeStart: 0.62,
  edgeEnd: 0.86,
  pocketStill: 1.7,
  pocketMoving: 3.1,
  pocketSoftness: 0.45,
  reachMin: 3.2,
  reachMax: 14,
  behind: 0.8,
  widthNear: 2.2,
  widthFar: 4.6,
  widthSoftness: 0.5,
  goingAbove: 0.2,
  momentumRise: 0.42,
  momentumFall: 0.75,
  channelShare: 3,
  openStiffness: 70,
  openDamping: 15,
  closeStiffness: 2.6,
  closeDamping: 3.1,
  linger: 0.7,
  dirStiffness: 13,
  dirDamping: 7.2,
  lookShare: 0.35,
  settleBelow: 0.05,
  springStep: 1 / 90,
  gustMinWait: 7,
  gustMaxWait: 14,
  gustFirstWait: 5,
  gustAbove: 0.3,
  gustReach: 27,
  gustWidth: 1.5,
  gustRise: 0.45,
  gustHold: 1.3,
  gustAim: 70,
  gustSwing: 25,
  eddies: 3,
  eddyEvery: 0.9,
  eddyLife: 2.6,
  eddySpin: 1.4,
  eddyRadius: 2.2,
  eddyBehind: 1.6,
  eddyTurnBoost: 2.5,
  eddyAbove: 0.25,
} as const;

const DEGREES: number = Math.PI / 180;

export interface MistField {
  readonly cells: number;
  readonly cell: number;
  readonly value: Float32Array;
  readonly speed: Float32Array;
  readonly held: Float32Array;
  readonly age: Float32Array;
  readonly bytes: Uint8Array;
}

export interface GustAim {
  readonly dir: Vec2;
  readonly aimed: boolean;
}

export interface Gust {
  readonly dir: Vec2;
  readonly aimed: boolean;
  phase: number;
  strength: number;
}

export interface Eddy {
  readonly at: Vec2;
  readonly spin: number;
  life: number;
}

export interface MistDrive {
  readonly dir: Vec2;
  readonly dirVelocity: Vec2;
  momentum: number;
  gustWait: number;
  gust: Gust | null;
  eddyWait: number;
  readonly eddies: Eddy[];
  lastDir: Vec2;
}

export interface MistInput {
  readonly hero: Vec2;
  readonly speed: number;
  readonly maxSpeed: number;
  readonly moveDir: Vec2 | null;
  readonly look: Vec2 | null;
  readonly finds: readonly Vec2[];
  readonly dt: number;
  readonly random: () => number;
}

export function createMistField(cells: number): MistField {
  const count: number = cells * cells;
  return { cells, cell: MIST.span / cells, value: new Float32Array(count), speed: new Float32Array(count), held: new Float32Array(count), age: new Float32Array(count), bytes: new Uint8Array(count) };
}

export function createMistDrive(): MistDrive {
  return { dir: { x: 0, z: 1 }, dirVelocity: { x: 0, z: 0 }, momentum: 0, gustWait: MIST.gustFirstWait, gust: null, eddyWait: MIST.eddyEvery, eddies: [], lastDir: { x: 0, z: 1 } };
}

function unit(x: number, z: number): Vec2 | null {
  const size: number = Math.hypot(x, z);
  return size > 1e-6 ? { x: x / size, z: z / size } : null;
}

function smooth(edge0: number, edge1: number, value: number): number {
  const t: number = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function going(input: Pick<MistInput, 'speed' | 'maxSpeed'>): number {
  return Math.min(1, Math.max(0, input.speed / Math.max(input.maxSpeed, 1e-3)));
}

export function wantedDir(drive: Pick<MistDrive, 'dir'>, input: Pick<MistInput, 'moveDir' | 'look'>): Vec2 {
  const move: Vec2 | null = input.moveDir;
  const look: Vec2 | null = input.look;
  if (move === null) return look ?? drive.dir;
  if (look === null) return move;
  return unit(move.x * (1 - MIST.lookShare) + look.x * MIST.lookShare, move.z * (1 - MIST.lookShare) + look.z * MIST.lookShare) ?? move;
}

function swing(drive: MistDrive, target: Vec2, dt: number): void {
  const steps: number = Math.max(1, Math.ceil(dt / MIST.springStep));
  const step: number = dt / steps;
  let x: number = drive.dir.x;
  let z: number = drive.dir.z;
  let vx: number = drive.dirVelocity.x;
  let vz: number = drive.dirVelocity.z;
  for (let index: number = 0; index < steps; index += 1) {
    vx += ((target.x - x) * MIST.dirStiffness - vx * MIST.dirDamping) * step;
    vz += ((target.z - z) * MIST.dirStiffness - vz * MIST.dirDamping) * step;
    x += vx * step;
    z += vz * step;
  }
  const dir: Vec2 = unit(x, z) ?? drive.dir;
  drive.dir.x = dir.x;
  drive.dir.z = dir.z;
  drive.dirVelocity.x = vx;
  drive.dirVelocity.z = vz;
}

export function stepMomentum(momentum: number, pace: number, dt: number): number {
  const next: number = pace > MIST.goingAbove ? momentum + MIST.momentumRise * pace * dt : momentum - MIST.momentumFall * dt;
  return Math.min(1, Math.max(0, next));
}

function rotate(dir: Vec2, angle: number): Vec2 {
  const c: number = Math.cos(angle);
  const s: number = Math.sin(angle);
  return { x: dir.x * c - dir.z * s, z: dir.x * s + dir.z * c };
}

export function gustAim(dir: Vec2, hero: Vec2, finds: readonly Vec2[], random: () => number): GustAim {
  const ahead: Vec2[] = finds.flatMap((find: Vec2): Vec2[] => {
    const toward: Vec2 | null = unit(find.x - hero.x, find.z - hero.z);
    return toward !== null && toward.x * dir.x + toward.z * dir.z >= Math.cos(MIST.gustAim * DEGREES) ? [toward] : [];
  });
  const found: Vec2 | undefined = ahead[0];
  return found === undefined ? { dir: rotate(dir, (random() * 2 - 1) * MIST.gustSwing * DEGREES), aimed: false } : { dir: found, aimed: true };
}

function stepGust(drive: MistDrive, input: MistInput): void {
  const gust: Gust | null = drive.gust;
  if (gust !== null) {
    gust.phase += input.dt;
    gust.strength = gust.phase < MIST.gustRise ? smooth(0, MIST.gustRise, gust.phase) : gust.phase < MIST.gustRise + MIST.gustHold ? 1 : 0;
    if (gust.strength <= 0) drive.gust = null;
    return;
  }
  if (drive.momentum < MIST.gustAbove) return;
  drive.gustWait -= input.dt;
  if (drive.gustWait > 0) return;
  drive.gustWait = mix(MIST.gustMinWait, MIST.gustMaxWait, input.random());
  drive.gust = { ...gustAim(drive.dir, input.hero, input.finds, input.random), phase: 0, strength: 0 };
}

function stepEddies(drive: MistDrive, input: MistInput, pace: number): void {
  for (const eddy of drive.eddies) eddy.life -= input.dt / MIST.eddyLife;
  const alive: Eddy[] = drive.eddies.filter((eddy: Eddy): boolean => eddy.life > 0);
  drive.eddies.length = 0;
  drive.eddies.push(...alive);
  const turn: number = drive.lastDir.x * drive.dir.z - drive.lastDir.z * drive.dir.x;
  drive.lastDir = { x: drive.dir.x, z: drive.dir.z };
  if (pace < MIST.eddyAbove) return;
  drive.eddyWait -= input.dt * pace * (1 + Math.abs(turn) * MIST.eddyTurnBoost / Math.max(input.dt, 1e-3));
  if (drive.eddyWait > 0) return;
  drive.eddyWait = MIST.eddyEvery;
  const side: number = turn === 0 ? (input.random() < 0.5 ? -1 : 1) : Math.sign(turn);
  const at: Vec2 = { x: input.hero.x - drive.dir.x * MIST.eddyBehind - drive.dir.z * side * 0.6, z: input.hero.z - drive.dir.z * MIST.eddyBehind + drive.dir.x * side * 0.6 };
  drive.eddies.push({ at, spin: side * MIST.eddySpin * mix(0.6, 1, pace), life: 1 });
  if (drive.eddies.length > MIST.eddies) drive.eddies.shift();
}

export function stepDrive(drive: MistDrive, input: MistInput): void {
  const pace: number = going(input);
  drive.momentum = stepMomentum(drive.momentum, pace, input.dt);
  const wanted: Vec2 = wantedDir(drive, input);
  if (drive.momentum < MIST.settleBelow) {
    drive.dir.x = wanted.x;
    drive.dir.z = wanted.z;
    drive.dirVelocity.x = 0;
    drive.dirVelocity.z = 0;
  } else swing(drive, wanted, input.dt);
  stepGust(drive, input);
  stepEddies(drive, input, pace);
}

export function clearing(drive: Pick<MistDrive, 'dir' | 'momentum' | 'gust'>, dx: number, dz: number): number {
  const m: number = drive.momentum;
  const pocket: number = mix(MIST.pocketStill, MIST.pocketMoving, m);
  const around: number = 1 - smooth(pocket * (1 - MIST.pocketSoftness), pocket, Math.hypot(dx, dz));
  const along: number = dx * drive.dir.x + dz * drive.dir.z;
  const across: number = Math.abs(dz * drive.dir.x - dx * drive.dir.z);
  const reach: number = mix(MIST.reachMin, MIST.reachMax, m);
  const width: number = mix(MIST.widthNear, MIST.widthFar, Math.min(1, Math.max(0, along / reach))) * mix(0.55, 1, m);
  const lane: number = smooth(-MIST.behind, 0, along) * (1 - smooth(reach * 0.65, reach, along)) * (1 - smooth(width * (1 - MIST.widthSoftness), width, across));
  const channel: number = lane * Math.min(1, m * MIST.channelShare);
  const gust: Gust | null = drive.gust;
  let glimpse: number = 0;
  if (gust !== null && gust.strength > 0) {
    const g: number = dx * gust.dir.x + dz * gust.dir.z;
    const off: number = Math.abs(dz * gust.dir.x - dx * gust.dir.z);
    const w: number = MIST.gustWidth * mix(0.7, 1.6, Math.min(1, Math.max(0, g / MIST.gustReach)));
    glimpse = gust.strength * smooth(0, 2, g) * (1 - smooth(MIST.gustReach * 0.75, MIST.gustReach, g)) * (1 - smooth(w * 0.4, w, off));
  }
  return Math.max(around, channel, glimpse);
}

function wrapped(offset: number, span: number): number {
  return offset - span * Math.round(offset / span);
}

function relax(field: MistField, index: number, goal: number, dt: number): void {
  const value: number = field.value[index] ?? 0;
  let speed: number = field.speed[index] ?? 0;
  const opening: boolean = goal > value;
  const stiffness: number = opening ? MIST.openStiffness : MIST.closeStiffness;
  const damping: number = opening ? MIST.openDamping : MIST.closeDamping;
  speed += ((goal - value) * stiffness - speed * damping) * dt;
  const next: number = Math.min(1, Math.max(0, value + speed * dt));
  field.value[index] = next;
  field.speed[index] = next <= 0 || next >= 1 ? 0 : speed;
  field.bytes[index] = Math.round(next * 255);
}

export function stepField(field: MistField, drive: MistDrive, hero: Vec2, dt: number): void {
  const half: number = MIST.span / 2;
  const steps: number = Math.max(1, Math.ceil(dt / MIST.springStep));
  const step: number = dt / steps;
  for (let row: number = 0; row < field.cells; row += 1) {
    const dz: number = wrapped((row + 0.5) * field.cell - hero.z, MIST.span);
    for (let col: number = 0; col < field.cells; col += 1) {
      const index: number = row * field.cells + col;
      const dx: number = wrapped((col + 0.5) * field.cell - hero.x, MIST.span);
      const edge: number = Math.max(Math.abs(dx), Math.abs(dz)) / half;
      if (edge >= MIST.edgeEnd) {
        field.value[index] = 0;
        field.speed[index] = 0;
        field.held[index] = 0;
        field.bytes[index] = 0;
        continue;
      }
      const stamp: number = clearing(drive, dx, dz) * (1 - smooth(MIST.edgeStart, MIST.edgeEnd, edge));
      const held: number = field.held[index] ?? 0;
      const age: number = field.age[index] ?? 0;
      if (stamp >= held) {
        field.held[index] = stamp;
        field.age[index] = 0;
      } else {
        field.age[index] = age + dt;
        if (age + dt > MIST.linger) field.held[index] = stamp;
      }
      const goal: number = field.held[index] ?? stamp;
      for (let sub: number = 0; sub < steps; sub += 1) relax(field, index, goal, step);
    }
  }
}

export function sampleField(field: MistField, at: Vec2): number {
  const col: number = Math.floor((((at.x % MIST.span) + MIST.span) % MIST.span) / field.cell);
  const row: number = Math.floor((((at.z % MIST.span) + MIST.span) % MIST.span) / field.cell);
  return field.value[row * field.cells + col] ?? 0;
}
