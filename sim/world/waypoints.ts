import type { ZoneDef, ZoneWaypoint } from '../content/types.ts';
import { distance } from '../math.ts';
import type { World } from './types.ts';
import { enterZone } from './zones.ts';

export function onWaypoint(world: World): boolean {
  const waypoint: ZoneWaypoint | null = world.zone.waypoint;
  return waypoint !== null && world.player.alive && distance(world.player.pos, waypoint) <= waypoint.radius;
}

export function stepWaypoints(world: World): void {
  if (!onWaypoint(world)) return;
  if (world.respawn.type !== 'waypoint') world.respawn = { type: 'waypoint' };
  if (world.waypoints.includes(world.zone.id)) return;
  world.waypoints.push(world.zone.id);
  world.events.push({ type: 'waypoint_unlocked', zone: world.zone.id });
}

export function canTeleport(world: World, zoneId: string): boolean {
  const target: ZoneDef | undefined = world.content.zones.get(zoneId);
  return target !== undefined && target.waypoint !== null && target.id !== world.zone.id && world.waypoints.includes(zoneId) && onWaypoint(world);
}

export function teleport(world: World, zoneId: string): void {
  const target: ZoneDef | undefined = world.content.zones.get(zoneId);
  if (target === undefined || !canTeleport(world, zoneId)) return;
  const from: string = world.zone.id;
  enterZone(world, target, { type: 'waypoint' });
  world.events.push({ type: 'zone_changed', from, to: target.id });
}
