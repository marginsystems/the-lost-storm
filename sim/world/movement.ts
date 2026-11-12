import type { Vec2 } from '../math.ts';
import { distance, facingOf } from '../math.ts';
import type { NavGrid } from '../nav/grid.ts';
import { moveWithCollision, paceAt } from '../nav/grid.ts';
import { isDashing } from './dash.ts';
import type { ActorState, World } from './types.ts';

const MOVEMENT = {
  knockFriction: 9,
  knockRest: 0.08,
  arrive: 1e-4,
  separationPasses: 2,
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

export function stepKnock(grid: NavGrid, actor: ActorState, dt: number): void {
  if (Math.hypot(actor.knock.x, actor.knock.z) < MOVEMENT.knockRest) {
    actor.knock.x = 0;
    actor.knock.z = 0;
    return;
  }
  moveWithCollision(grid, actor.pos, actor.knock.x * dt, actor.knock.z * dt);
  const decay: number = Math.exp(-MOVEMENT.knockFriction * dt);
  actor.knock.x *= decay;
  actor.knock.z *= decay;
}

export function followPath(grid: NavGrid, actor: ActorState, path: Vec2[], travel: number, maxTurn: number): number {
  let remaining: number = travel * paceAt(grid, actor.pos.x, actor.pos.z);
  let moved: number = 0;
  while (remaining > MOVEMENT.arrive) {
    const next: Vec2 | undefined = path[0];
    if (next === undefined) break;
    const gap: number = distance(actor.pos, next);
    const share: number = gap <= remaining ? 1 : remaining / Math.max(gap, MOVEMENT.arrive);
    const fromX: number = actor.pos.x;
    const fromZ: number = actor.pos.z;
    moveWithCollision(grid, actor.pos, (next.x - fromX) * share, (next.z - fromZ) * share);
    const step: number = Math.hypot(actor.pos.x - fromX, actor.pos.z - fromZ);
    moved += step;
    remaining -= step;
    if (share < 1) break;
    if (distance(actor.pos, next) > MOVEMENT.arrive) break;
    path.shift();
  }
  const ahead: Vec2 | undefined = path[0];
  if (ahead !== undefined) faceToward(actor, { x: ahead.x - actor.pos.x, z: ahead.z - actor.pos.z }, maxTurn);
  return moved;
}

export interface SteerStep {
  readonly moved: number;
  readonly tried: number;
}

const NO_STEP: SteerStep = { moved: 0, tried: 0 };

export function steerAlong(grid: NavGrid, actor: ActorState, path: Vec2[], travel: number, dt: number, steering: Steering): SteerStep {
  while (path.length > 1) {
    const passed: Vec2 | undefined = path[0];
    if (passed === undefined || distance(actor.pos, passed) > steering.passRadius) break;
    path.shift();
  }
  const next: Vec2 | undefined = path[0];
  if (next === undefined) return NO_STEP;
  const dx: number = next.x - actor.pos.x;
  const dz: number = next.z - actor.pos.z;
  const gap: number = Math.hypot(dx, dz);
  if (gap <= MOVEMENT.arrive) {
    path.shift();
    return NO_STEP;
  }
  const settling: boolean = path.length === 1 && gap <= steering.settleRadius;
  const wanted: number = facingOf({ x: dx, z: dz });
  if (!settling) actor.facing = steerHeading(actor.facing, wanted, dt, steering);
  const reach: number = travel * paceAt(grid, actor.pos.x, actor.pos.z) * (settling ? 1 : alignedSpeed(angleBetween(actor.facing, wanted), steering));
  const fromX: number = actor.pos.x;
  const fromZ: number = actor.pos.z;
  if (gap <= reach || settling) {
    const share: number = Math.min(1, reach / gap);
    moveWithCollision(grid, actor.pos, dx * share, dz * share);
    if (distance(actor.pos, next) <= MOVEMENT.arrive) path.shift();
  } else {
    moveWithCollision(grid, actor.pos, Math.sin(actor.facing) * reach, Math.cos(actor.facing) * reach);
  }
  return { moved: Math.hypot(actor.pos.x - fromX, actor.pos.z - fromZ), tried: Math.min(gap, reach) };
}

function pushApart(grid: NavGrid, a: ActorState, b: ActorState, shareA: number): void {
  if (isDashing(a) || isDashing(b)) return;
  const dx: number = b.pos.x - a.pos.x;
  const dz: number = b.pos.z - a.pos.z;
  const gap: number = Math.hypot(dx, dz);
  const overlap: number = a.radius + b.radius - gap;
  if (overlap <= 0) return;
  const nx: number = gap > MOVEMENT.arrive ? dx / gap : 1;
  const nz: number = gap > MOVEMENT.arrive ? dz / gap : 0;
  moveWithCollision(grid, a.pos, -nx * overlap * shareA, -nz * overlap * shareA);
  moveWithCollision(grid, b.pos, nx * overlap * (1 - shareA), nz * overlap * (1 - shareA));
}

export function separateActors(world: World): void {
  const living: ActorState[] = world.monsters.filter((monster: ActorState): boolean => monster.alive);
  for (let pass: number = 0; pass < MOVEMENT.separationPasses; pass += 1) {
    for (let first: number = 0; first < living.length; first += 1) {
      const a: ActorState | undefined = living[first];
      if (a === undefined) continue;
      for (let second: number = first + 1; second < living.length; second += 1) {
        const b: ActorState | undefined = living[second];
        if (b !== undefined) pushApart(world.grid, a, b, 0.5);
      }
      if (world.player.alive) pushApart(world.grid, world.player, a, 0);
    }
  }
}
