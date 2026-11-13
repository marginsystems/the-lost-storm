import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { findPath } from '../nav/path.ts';
import type { World } from './types.ts';

export const ROUTE_CORNER = {
  pass: 1,
} as const;

export function routeCorner(world: World, goal: Vec2): Vec2 {
  const from: Vec2 = world.player.pos;
  for (const point of findPath(world.grid, from, goal)) if (distance(point, from) > ROUTE_CORNER.pass) return point;
  return goal;
}
