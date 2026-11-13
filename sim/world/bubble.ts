import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { isWalkable } from '../nav/grid.ts';
import { echoMonsters } from './moments.ts';
import { shellLimit } from './shell.ts';
import type { ActorState, MomentState, MonsterState, World } from './types.ts';

export const BUBBLE = {
  rest: 1e-6,
  easeSpeed: 3,
} as const;

function inward(actor: ActorState, centre: Vec2, limit: number): void {
  const dx: number = actor.pos.x - centre.x;
  const dz: number = actor.pos.z - centre.z;
  const reach: number = Math.hypot(dx, dz);
  if (reach <= limit || reach < BUBBLE.rest) return;
  const nx: number = dx / reach;
  const nz: number = dz / reach;
  actor.pos.x = centre.x + nx * limit;
  actor.pos.z = centre.z + nz * limit;
  const outward: number = actor.knock.x * nx + actor.knock.z * nz;
  if (outward <= 0) return;
  actor.knock.x -= nx * outward;
  actor.knock.z -= nz * outward;
}

export function heldIn(world: World, start: Vec2): MomentState | null {
  return world.moments.find((moment: MomentState): boolean => moment.phase === 'awake' && moment.entered && distance(start, moment.pos) <= moment.def.radius) ?? null;
}

export function bindEchoes(world: World, dt: number, starts: ReadonlyMap<ActorState, Vec2>): void {
  for (const moment of world.moments) {
    if (moment.phase !== 'awake') continue;
    for (const monster of echoMonsters(world, moment)) {
      const limit: number = shellLimit(moment, monster.radius);
      const from: Vec2 = starts.get(monster) ?? monster.pos;
      const stray: number = distance(from, moment.pos) - limit;
      if (stray <= BUBBLE.rest) {
        inward(monster, moment.pos, limit);
        continue;
      }
      inward(monster, moment.pos, Math.max(limit, Math.min(distance(monster.pos, moment.pos), limit + stray - BUBBLE.easeSpeed * dt)));
    }
  }
}

function chasesInside(world: World, bubble: MomentState): boolean {
  const intent = world.player.intent;
  if (intent.type !== 'attack') return false;
  const target: MonsterState | undefined = world.monsters.find((monster: MonsterState): boolean => monster.id === intent.targetId);
  return target !== undefined && distance(target.pos, bubble.pos) <= bubble.def.radius;
}

export function holdHero(world: World, start: Vec2, bubble: MomentState | null): void {
  const player = world.player;
  if (bubble === null || !player.alive) return;
  const walked: Vec2 = chasesInside(world, bubble) ? { x: 0, z: 0 } : player.walked;
  const pushed: Vec2 = { x: player.pos.x - walked.x, z: player.pos.z - walked.z };
  const limit: number = Math.max(bubble.def.radius - player.radius, distance(start, bubble.pos));
  if (distance(pushed, bubble.pos) <= limit) return;
  player.pos.x = pushed.x;
  player.pos.z = pushed.z;
  inward(player, bubble.pos, limit);
  if (!isWalkable(world.grid, player.pos.x, player.pos.z)) {
    player.pos.x = start.x;
    player.pos.z = start.z;
  }
  player.pos.x += walked.x;
  player.pos.z += walked.z;
}
