import type { ZoneDef, ZoneExit } from '../content/types.ts';
import type { ReadonlyVec2, Vec2 } from '../math.ts';
import { allHold } from './conditions.ts';
import type { World } from './types.ts';

export function moveExit(world: World, exitId: string, pos: Vec2): void {
  const zone: ZoneDef = world.zone;
  const exits: ZoneExit[] = [...zone.exits];
  const index: number = exits.findIndex((exit: ZoneExit): boolean => exit.id === exitId);
  const exit: ZoneExit | undefined = exits[index];
  if (exit === undefined) return;
  exits[index] = { ...exit, x: pos.x, z: pos.z };
  world.zone = { ...zone, exits };
}

export function exitShown(world: World, exit: ZoneExit): boolean {
  return !exit.hiddenWhenLocked || allHold(world, exit.requires);
}

export function exitUnder(world: World, point: Vec2): ZoneExit | null {
  return world.zone.exits.find((exit: ZoneExit): boolean => Math.hypot(exit.x - point.x, exit.z - point.z) <= exit.radius && exitShown(world, exit)) ?? null;
}

function lineReach(from: ReadonlyVec2, to: ReadonlyVec2, point: ReadonlyVec2): { readonly gap: number; readonly along: number } {
  const dx: number = to.x - from.x;
  const dz: number = to.z - from.z;
  const span: number = dx * dx + dz * dz;
  const along: number = span <= 0 ? 0 : Math.min(1, Math.max(0, ((point.x - from.x) * dx + (point.z - from.z) * dz) / span));
  return { gap: Math.hypot(point.x - (from.x + dx * along), point.z - (from.z + dz * along)), along };
}

export function exitOnLine(world: World, from: ReadonlyVec2, to: ReadonlyVec2, slack: number): ZoneExit | null {
  let first: ZoneExit | null = null;
  let firstAlong: number = Number.POSITIVE_INFINITY;
  for (const exit of world.zone.exits) {
    if (!exitShown(world, exit) || !allHold(world, exit.requires)) continue;
    const reach: { readonly gap: number; readonly along: number } = lineReach(from, to, exit);
    if (reach.gap > exit.radius + slack || reach.along >= firstAlong) continue;
    first = exit;
    firstAlong = reach.along;
  }
  return first;
}
