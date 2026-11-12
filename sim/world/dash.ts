import type { DashDelivery } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import type { NavGrid } from '../nav/grid.ts';
import { moveWithCollision } from '../nav/grid.ts';
import type { ActionState, ActorState } from './types.ts';

export const DASH = {
  step: 0.2,
  aimDeadZone: 0.3,
} as const;

export function dashOf(action: ActionState | null): DashDelivery | null {
  if (action === null || action.skill.delivery.type !== 'dash') return null;
  return action.skill.delivery;
}

export function isDashing(actor: ActorState): boolean {
  return actor.action !== null && actor.action.phase === 'windup' && dashOf(actor.action) !== null;
}

export function isInvulnerable(actor: ActorState): boolean {
  const action: ActionState | null = actor.action;
  const dash: DashDelivery | null = dashOf(action);
  if (action === null || dash === null || action.phase !== 'windup') return false;
  return action.windup - action.timeLeft < dash.invulnerable;
}

export function canDash(actor: ActorState): boolean {
  return actor.alive && actor.stagger <= 0;
}

export function dashAim(actor: ActorState, aim: Vec2, path: readonly Vec2[]): Vec2 {
  if (Math.hypot(aim.x - actor.pos.x, aim.z - actor.pos.z) > DASH.aimDeadZone) return aim;
  return path[0] ?? aim;
}

export function stepDash(grid: NavGrid, actor: ActorState, action: ActionState, dt: number): void {
  const dash: DashDelivery | null = dashOf(action);
  if (dash === null || action.phase !== 'windup' || action.windup <= 0) return;
  let travel: number = (dash.distance * Math.min(dt, Math.max(0, action.timeLeft))) / action.windup;
  while (travel > 0) {
    const step: number = Math.min(travel, DASH.step);
    travel -= step;
    moveWithCollision(grid, actor.pos, action.direction.x * step, action.direction.z * step);
  }
}
