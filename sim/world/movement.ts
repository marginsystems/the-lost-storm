import type { Vec2 } from '../math.ts';
import { distance, facingOf } from '../math.ts';
import type { NavGrid } from '../nav/grid.ts';
import { isWalkable, lineWalkable, moveWithCollision, paceAt, routedGrid, slideAlong, slideOnBody, stepClear } from '../nav/grid.ts';
import { isDashing } from './dash.ts';
import { heroShare, pushShare, steadiness } from './poise.ts';
import type { Actor, ActorState, MonsterState, World } from './types.ts';

const MOVEMENT = {
  knockFriction: 9,
  knockRest: 0.08,
  readablePush: 0.05,
  arrive: 1e-4,
  separationPasses: 2,
  slideAlong: 0.76,
  wallLean: 0.2,
  turnOut: [0.35, -0.35, 0.7, -0.7],
  headOut: [0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.5, -1.5],
  strideCos: 0.76,
  closeShare: 0.25,
  contact: 0.001,
} as const;

export interface Steering {
  readonly maxTurnRate: number;
  readonly minTurnRate: number;
  readonly turnGain: number;
  readonly fullSpeedAngle: number;
  readonly sharpAngle: number;
  readonly sharpSpeed: number;
  readonly passRadius: number;
  readonly settleRadius: number;
}

export function angleBetween(current: number, target: number): number {
  let delta: number = (target - current) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

export function turnToward(current: number, target: number, maxStep: number): number {
  const delta: number = angleBetween(current, target);
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}

export function steerHeading(current: number, target: number, dt: number, steering: Steering): number {
  const delta: number = angleBetween(current, target);
  const rate: number = Math.max(steering.minTurnRate, Math.min(steering.maxTurnRate, steering.turnGain * Math.abs(delta)));
  return turnToward(current, target, rate * dt);
}

export function alignedSpeed(misalignment: number, steering: Steering): number {
  const off: number = Math.abs(misalignment);
  if (off <= steering.fullSpeedAngle) return 1;
  if (off >= steering.sharpAngle) return steering.sharpSpeed;
  const along: number = (off - steering.fullSpeedAngle) / (steering.sharpAngle - steering.fullSpeedAngle);
  const eased: number = along * along * (3 - 2 * along);
  return 1 + (steering.sharpSpeed - 1) * eased;
}

export function faceToward(actor: ActorState, direction: Vec2, maxStep: number): void {
  if (Math.hypot(direction.x, direction.z) <= MOVEMENT.arrive) return;
  actor.facing = turnToward(actor.facing, facingOf(direction), maxStep);
}

export function stepTimers(actor: ActorState, dt: number): void {
  for (const key of Object.keys(actor.cooldowns)) {
    const left: number = (actor.cooldowns[key] ?? 0) - dt;
    actor.cooldowns[key] = Math.max(0, left);
  }
  actor.stagger = Math.max(0, actor.stagger - dt);
  actor.root = Math.max(0, actor.root - dt);
  actor.rootGrace = Math.max(0, actor.rootGrace - dt);
  actor.tempoTime = Math.max(0, actor.tempoTime - dt);
  if (actor.tempoTime <= 0) actor.tempo = 1;
  if (actor.brand !== null) {
    actor.brand.timeLeft -= dt;
    if (actor.brand.timeLeft <= 0) actor.brand = null;
  }
  if (actor.combo === null) return;
  actor.combo.timeLeft -= dt;
  if (actor.combo.timeLeft <= 0) actor.combo = null;
}

export function pushDistance(knock: Vec2): number {
  return Math.hypot(knock.x, knock.z) / MOVEMENT.knockFriction;
}

export function readablePush(knock: Vec2): boolean {
  return pushDistance(knock) >= MOVEMENT.readablePush;
}

export function knockTime(actor: ActorState): number {
  const speed: number = Math.hypot(actor.knock.x, actor.knock.z);
  if (speed < MOVEMENT.knockRest) return 0;
  return Math.log(speed / MOVEMENT.knockRest) / MOVEMENT.knockFriction;
}

export function stepKnock(grid: NavGrid, actor: ActorState, dt: number): void {
  if (Math.hypot(actor.knock.x, actor.knock.z) < MOVEMENT.knockRest) {
    actor.knock.x = 0;
    actor.knock.z = 0;
    return;
  }
  moveWithCollision(grid, actor.pos, actor.knock.x * dt, actor.knock.z * dt);
  actor.motion = 'knocked';
  const decay: number = Math.exp(-MOVEMENT.knockFriction * dt);
  actor.knock.x *= decay;
  actor.knock.z *= decay;
}

export function beingKnocked(actor: ActorState): boolean {
  return actor.motion === 'knocked';
}

export function strideOf(actor: ActorState, from: Vec2): Vec2 {
  return { x: actor.pos.x - from.x, z: actor.pos.z - from.z };
}

export function settleGaits(starts: ReadonlyMap<ActorState, Vec2>, dt: number): void {
  for (const [actor, from] of starts) {
    const moved: number = Math.hypot(actor.pos.x - from.x, actor.pos.z - from.z);
    if (actor.motion === 'stride' && moved <= MOVEMENT.arrive) actor.motion = 'still';
    actor.gait = actor.motion === 'stride' && dt > 0 ? moved / dt : 0;
  }
}

export interface SteerStep {
  readonly moved: number;
  readonly tried: number;
}

const NO_STEP: SteerStep = { moved: 0, tried: 0 };

function strideWithCollision(grid: NavGrid, pos: Vec2, dx: number, dz: number): void {
  const length: number = Math.hypot(dx, dz);
  if (length <= MOVEMENT.arrive) return;
  if (stepClear(grid, pos, dx, dz) || (closeSlide(grid, pos, dx, dz) && slideOnBody(grid, pos, dx, dz))) return;
  const alongX: number = Math.abs(dx) / length;
  const alongZ: number = Math.abs(dz) / length;
  const slideX: boolean = alongX >= MOVEMENT.slideAlong && isWalkable(grid, pos.x + dx, pos.z);
  const slideZ: boolean = alongZ >= MOVEMENT.slideAlong && isWalkable(grid, pos.x, pos.z + dz);
  if (slideX && (!slideZ || alongX >= alongZ)) pos.x += dx;
  else if (slideZ) pos.z += dz;
  else turnOut(grid, pos, dx, dz);
}

function closeSlide(grid: NavGrid, pos: Vec2, dx: number, dz: number): boolean {
  const along: Vec2 | null = slideAlong(grid, pos, dx, dz);
  return along !== null && Math.hypot(along.x, along.z) >= Math.hypot(dx, dz) * MOVEMENT.strideCos;
}

function closesIn(grid: NavGrid, pos: Vec2, dx: number, dz: number): boolean {
  for (let share: number = 1; share >= MOVEMENT.closeShare; share /= 2) if (stepClear(grid, { x: pos.x, z: pos.z }, dx * share, dz * share)) return true;
  return false;
}

function freeHeading(grid: NavGrid, pos: Vec2, wanted: number, probe: number): number {
  if (closesIn(grid, pos, Math.sin(wanted) * probe, Math.cos(wanted) * probe)) return wanted;
  for (const angle of MOVEMENT.headOut) {
    const turned: number = wanted + angle;
    if (stepClear(grid, { x: pos.x, z: pos.z }, Math.sin(turned) * probe, Math.cos(turned) * probe)) return turned;
  }
  return wanted;
}

function turnOut(grid: NavGrid, pos: Vec2, dx: number, dz: number): void {
  const length: number = Math.hypot(dx, dz);
  for (let share: number = 1 / 2; share * length >= MOVEMENT.contact; share /= 2) if (stepClear(grid, pos, dx * share, dz * share)) return;
  for (const angle of MOVEMENT.turnOut) {
    const cos: number = Math.cos(angle);
    const sin: number = Math.sin(angle);
    if (stepClear(grid, pos, dx * cos + dz * sin, dz * cos - dx * sin)) return;
  }
}

function aroundWall(grid: NavGrid, pos: Vec2, wanted: number, probe: number, reachable: boolean): number {
  const dx: number = Math.sin(wanted);
  const dz: number = Math.cos(wanted);
  if (probe <= MOVEMENT.arrive || stepClear(grid, { x: pos.x, z: pos.z }, dx * probe, dz * probe)) return wanted;
  const along: Vec2 | null = slideAlong(grid, pos, dx * probe, dz * probe);
  if (along !== null && Math.hypot(along.x, along.z) > MOVEMENT.arrive) return facingOf(along);
  const alongX: number = Math.abs(dx) >= MOVEMENT.wallLean ? Math.sign(dx) * probe : 0;
  const alongZ: number = Math.abs(dz) >= MOVEMENT.wallLean ? Math.sign(dz) * probe : 0;
  const openX: boolean = alongX !== 0 && isWalkable(grid, pos.x + alongX, pos.z);
  const openZ: boolean = alongZ !== 0 && isWalkable(grid, pos.x, pos.z + alongZ);
  if (openX && (!openZ || Math.abs(dx) >= Math.abs(dz))) return facingOf({ x: alongX, z: 0 });
  if (openZ) return facingOf({ x: 0, z: alongZ });
  return reachable ? freeHeading(grid, pos, wanted, probe) : wanted;
}

export function steerToward(grid: NavGrid, actor: ActorState, wanted: number, travel: number, dt: number, steering: Steering): SteerStep {
  const pace: number = travel * paceAt(grid, actor.pos.x, actor.pos.z);
  const heading: number = aroundWall(grid, actor.pos, wanted, pace, true);
  actor.facing = steerHeading(actor.facing, heading, dt, steering);
  const reach: number = pace * alignedSpeed(angleBetween(actor.facing, heading), steering);
  const fromX: number = actor.pos.x;
  const fromZ: number = actor.pos.z;
  strideWithCollision(grid, actor.pos, Math.sin(actor.facing) * reach, Math.cos(actor.facing) * reach);
  const moved: number = Math.hypot(actor.pos.x - fromX, actor.pos.z - fromZ);
  if (moved > MOVEMENT.arrive) actor.motion = 'stride';
  return { moved, tried: reach };
}

export function steerAlong(grid: NavGrid, actor: ActorState, path: Vec2[], travel: number, dt: number, steering: Steering): SteerStep {
  while (path.length > 1) {
    const passed: Vec2 | undefined = path[0];
    const after: Vec2 | undefined = path[1];
    if (passed === undefined || after === undefined || distance(actor.pos, passed) > steering.passRadius || !lineWalkable(grid, actor.pos, after)) break;
    path.shift();
  }
  let next: Vec2 | undefined = path[0];
  while (next !== undefined && distance(actor.pos, next) <= MOVEMENT.arrive) {
    path.shift();
    next = path[0];
  }
  if (next === undefined) return NO_STEP;
  const dx: number = next.x - actor.pos.x;
  const dz: number = next.z - actor.pos.z;
  const gap: number = Math.hypot(dx, dz);
  const settling: boolean = path.length === 1 && gap <= steering.settleRadius;
  const pace: number = travel * paceAt(grid, actor.pos.x, actor.pos.z);
  const wanted: number = settling ? facingOf({ x: dx, z: dz }) : aroundWall(grid, actor.pos, facingOf({ x: dx, z: dz }), Math.min(pace, gap), isWalkable(grid, next.x, next.z));
  if (!settling) actor.facing = steerHeading(actor.facing, wanted, dt, steering);
  const reach: number = pace * (settling ? 1 : alignedSpeed(angleBetween(actor.facing, wanted), steering));
  const fromX: number = actor.pos.x;
  const fromZ: number = actor.pos.z;
  const facingNext: boolean = Math.cos(angleBetween(actor.facing, facingOf({ x: dx, z: dz }))) >= MOVEMENT.strideCos;
  if (settling && !facingNext) {
    path.shift();
    return NO_STEP;
  }
  if (settling) {
    const share: number = Math.min(1, reach / gap);
    moveWithCollision(grid, actor.pos, dx * share, dz * share);
  } else if (gap <= reach && facingNext) {
    strideWithCollision(grid, actor.pos, dx, dz);
  } else {
    strideWithCollision(grid, actor.pos, Math.sin(actor.facing) * reach, Math.cos(actor.facing) * reach);
  }
  if (distance(actor.pos, next) <= MOVEMENT.arrive) path.shift();
  const moved: number = Math.hypot(actor.pos.x - fromX, actor.pos.z - fromZ);
  if (moved > MOVEMENT.arrive) actor.motion = 'stride';
  return { moved, tried: Math.min(gap, reach) };
}

function movable(actor: Actor): boolean {
  return actor.motion !== 'still' && !isDashing(actor) && steadiness(actor) > 0;
}

export type Strides = ReadonlyMap<ActorState, Vec2>;

interface Yield {
  readonly dt: number;
  readonly strides: Strides;
  readonly left: Map<ActorState, number>;
}

function yieldTo(grid: NavGrid, budget: Yield, actor: ActorState, wanted: number, awayX: number, awayZ: number): void {
  if (actor.motion !== 'stride') {
    moveWithCollision(grid, actor.pos, awayX * wanted, awayZ * wanted);
    return;
  }
  const step: Vec2 = budget.strides.get(actor) ?? { x: 0, z: 0 };
  const length: number = Math.hypot(step.x, step.z);
  if (length <= MOVEMENT.arrive) return;
  const into: number = -(step.x * awayX + step.z * awayZ) / length;
  if (into <= 0) return;
  const left: number = budget.left.get(actor) ?? length;
  const back: number = Math.min(wanted / into, left);
  budget.left.set(actor, left - back);
  moveWithCollision(grid, actor.pos, (-step.x / length) * back, (-step.z / length) * back);
}

function pushApart(grid: NavGrid, a: Actor, b: Actor, shareA: number, budget: Yield): void {
  const aMoves: boolean = movable(a);
  const bMoves: boolean = movable(b);
  if (!aMoves && !bMoves) return;
  const dx: number = b.pos.x - a.pos.x;
  const dz: number = b.pos.z - a.pos.z;
  const gap: number = Math.hypot(dx, dz);
  const overlap: number = a.radius + b.radius - gap;
  if (overlap <= 0) return;
  const nx: number = gap > MOVEMENT.arrive ? dx / gap : 1;
  const nz: number = gap > MOVEMENT.arrive ? dz / gap : 0;
  const share: number = !bMoves ? 1 : !aMoves ? 0 : shareA;
  if (share > 0) yieldTo(grid, budget, a, overlap * share, -nx, -nz);
  if (share < 1) yieldTo(grid, budget, b, overlap * (1 - share), nx, nz);
}

export function separateActors(world: World, dt: number, strides: Strides): void {
  const living: MonsterState[] = world.monsters.filter((monster: MonsterState): boolean => monster.alive);
  const budget: Yield = { dt, strides, left: new Map<ActorState, number>() };
  for (let pass: number = 0; pass < MOVEMENT.separationPasses; pass += 1) {
    for (let first: number = 0; first < living.length; first += 1) {
      const a: MonsterState | undefined = living[first];
      if (a === undefined) continue;
      for (let second: number = first + 1; second < living.length; second += 1) {
        const b: MonsterState | undefined = living[second];
        if (b !== undefined) pushApart(world.grid, a, b, pushShare(a, b), budget);
      }
      if (world.player.alive) pushApart(world.grid, world.player, a, heroShare(a), budget);
    }
  }
}

export function gridFor(world: World, actor: Actor): NavGrid {
  return actor.kind === 'monster' ? routedGrid(world.grid) : world.grid;
}
