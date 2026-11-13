import type { SkillDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import type { Blocker, GridStamp } from '../nav/grid.ts';
import { lineWalkable, liftStamp, stampBlockers } from '../nav/grid.ts';
import { findPath } from '../nav/path.ts';
import { playerMayStrike } from './factions.ts';
import type { Actor, ChaseState, MonsterState, PlayerState, World } from './types.ts';

export const CHASE = {
  bodyReach: 8,
  bodyMargin: 0.4,
  ownCell: 0.36,
  touch: 0.1,
  stepOut: 0.9,
  moveOut: 0.25,
  patience: 0.35,
} as const;

export function freshChase(pos: Vec2): ChaseState {
  return { mark: { x: pos.x, z: pos.z }, still: 0 };
}

function bodyBlocker(monster: MonsterState, hero: Vec2, heroRadius: number): Blocker {
  const roomy: number = distance(monster.pos, hero) - heroRadius - CHASE.ownCell;
  const radius: number = Math.max(monster.radius, Math.min(monster.radius + CHASE.bodyMargin, roomy));
  return { kind: 'capsule', from: { x: monster.pos.x, z: monster.pos.z }, to: { x: monster.pos.x, z: monster.pos.z }, radius };
}

function touching(world: World, target: Actor): MonsterState | null {
  const player: PlayerState = world.player;
  let closest: MonsterState | null = null;
  let closestGap: number = CHASE.touch;
  for (const monster of world.monsters) {
    if (!monster.alive || monster.id === target.id) continue;
    const gap: number = distance(monster.pos, player.pos) - monster.radius - player.radius;
    if (gap >= closestGap) continue;
    closest = monster;
    closestGap = gap;
  }
  return closest;
}

function stepAround(world: World, body: MonsterState, target: Actor): Vec2 | null {
  const player: PlayerState = world.player;
  const apart: number = Math.max(distance(player.pos, body.pos), Number.EPSILON);
  const outX: number = (player.pos.x - body.pos.x) / apart;
  const outZ: number = (player.pos.z - body.pos.z) / apart;
  const side: number = (target.pos.x - player.pos.x) * -outZ + (target.pos.z - player.pos.z) * outX >= 0 ? 1 : -1;
  const reach: number = CHASE.stepOut / Math.SQRT2;
  const point: Vec2 = { x: player.pos.x + (outX - outZ * side) * reach, z: player.pos.z + (outZ + outX * side) * reach };
  return lineWalkable(world.grid, player.pos, point) ? point : null;
}

export function chasePath(world: World, target: Actor): Vec2[] {
  const player: PlayerState = world.player;
  const body: MonsterState | null = touching(world, target);
  const out: Vec2 | null = body === null ? null : stepAround(world, body, target);
  const from: Vec2 = out ?? player.pos;
  const bodies: Blocker[] = world.monsters.filter((monster: MonsterState): boolean => monster.alive && monster.id !== target.id && distance(monster.pos, player.pos) <= CHASE.bodyReach).map((monster: MonsterState): Blocker => bodyBlocker(monster, from, world.content.player.radius));
  const stamp: GridStamp | null = bodies.length === 0 ? null : stampBlockers(world.grid, bodies, world.content.player.radius);
  const around: Vec2[] = findPath(world.grid, from, target.pos);
  if (stamp !== null) liftStamp(world.grid, stamp);
  const route: Vec2[] = around.length > 0 ? around : findPath(world.grid, from, target.pos);
  return out === null || route.length === 0 ? route : [out, ...route];
}

export function chaseStalled(player: PlayerState, dt: number): boolean {
  if (distance(player.pos, player.chase.mark) > CHASE.moveOut) {
    player.chase = freshChase(player.pos);
    return false;
  }
  player.chase.still += dt;
  return player.chase.still >= CHASE.patience;
}

function aheadOf(from: Vec2, toward: Vec2, point: Vec2): boolean {
  return (point.x - from.x) * (toward.x - from.x) + (point.z - from.z) * (toward.z - from.z) > 0;
}

export function blockerInReach(world: World, target: Actor, skill: SkillDef): MonsterState | null {
  const player: PlayerState = world.player;
  const heading: Vec2 = player.path[0] ?? target.pos;
  let best: MonsterState | null = null;
  let bestGap: number = Infinity;
  for (const monster of world.monsters) {
    if (monster.id === target.id || !playerMayStrike(world, monster)) continue;
    const gap: number = distance(player.pos, monster.pos) - monster.radius;
    const ahead: boolean = aheadOf(player.pos, heading, monster.pos) || aheadOf(player.pos, target.pos, monster.pos);
    if (gap > skill.engageRange || !ahead || gap >= bestGap) continue;
    best = monster;
    bestGap = gap;
  }
  return best;
}
