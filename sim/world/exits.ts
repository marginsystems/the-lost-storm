import type { ZoneDef, ZoneExit } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
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
