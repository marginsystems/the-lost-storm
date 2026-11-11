import type { Vec2 } from '../math.ts';
import { distance, facingOf } from '../math.ts';
import type { NavGrid } from '../nav/grid.ts';
import { moveWithCollision } from '../nav/grid.ts';
import type { ActorState, World } from './types.ts';

const MOVEMENT = {
  knockFriction: 9,
  knockRest: 0.08,
  arrive: 1e-4,
  turnStep: 0.05,
  separationPasses: 2,
} as const;

export function stepTimers(actor: ActorState, dt: number): void {
  for (const key of Object.keys(actor.cooldowns)) {
    const left: number = (actor.cooldowns[key] ?? 0) - dt;
    actor.cooldowns[key] = Math.max(0, left);
  }
  actor.stagger = Math.max(0, actor.stagger - dt);
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

export function followPath(actor: ActorState, path: Vec2[], travel: number): void {
  let remaining: number = travel;
  while (remaining > 0) {
    const next: Vec2 | undefined = path[0];
    if (next === undefined) return;
    const gap: number = distance(actor.pos, next);
    if (gap > MOVEMENT.turnStep) actor.facing = facingOf({ x: next.x - actor.pos.x, z: next.z - actor.pos.z });
    if (gap <= remaining) {
      actor.pos.x = next.x;
      actor.pos.z = next.z;
      path.shift();
      remaining -= gap;
    } else {
      actor.pos.x += ((next.x - actor.pos.x) / gap) * remaining;
      actor.pos.z += ((next.z - actor.pos.z) / gap) * remaining;
      remaining = 0;
    }
  }
}

function pushApart(grid: NavGrid, a: ActorState, b: ActorState, shareA: number): void {
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
