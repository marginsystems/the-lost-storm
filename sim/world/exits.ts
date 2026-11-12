import type { ZoneDef, ZoneExit } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
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
