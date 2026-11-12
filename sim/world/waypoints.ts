import type { ZoneDef, ZoneWaypoint } from '../content/types.ts';
import { distance } from '../math.ts';
import type { Vec2 } from '../math.ts';
import type { World } from './types.ts';
import { enterZone } from './zones.ts';

export function onWaypoint(world: World): boolean {
  const waypoint: ZoneWaypoint | null = world.zone.waypoint;
  return waypoint !== null && world.player.alive && distance(world.player.pos, waypoint) <= waypoint.radius;
}

export function waypointAt(world: World, point: Vec2): boolean {
  const waypoint: ZoneWaypoint | null = world.zone.waypoint;
  return waypoint !== null && distance(point, waypoint) <= waypoint.radius;
}

function insideCheckpoint(world: World): boolean {
  const respawn = world.respawn;
  return respawn.type === 'checkpoint' && world.zone.checkpoints.some((checkpoint): boolean => checkpoint.id === respawn.checkpoint && distance(world.player.pos, checkpoint) <= checkpoint.radius);
}

export function stepWaypoints(world: World): void {
  if (!onWaypoint(world)) return;
  if (world.respawn.type !== 'waypoint' && !insideCheckpoint(world)) world.respawn = { type: 'waypoint' };
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
