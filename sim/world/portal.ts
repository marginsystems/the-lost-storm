import type { ItemBaseDef, ItemUse, ZoneDef, ZonePoint } from '../content/types.ts';
import { baseOf } from '../items.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { takeOne } from '../stacks.ts';
import type { PortalChannelIntent, PortalEnd, PortalStage, PortalState } from './portal-types.ts';
import type { ItemInstance, MonsterState, PlayerState, RespawnPoint, World } from './types.ts';
import { enterZone, townZone } from './zones.ts';

export const PORTAL = {
  arriveOffset: 1.4,
} as const;

function mark(world: World, stage: PortalStage, zone: string, pos: Vec2): void {
  world.events.push({ type: 'portal', stage, zone, pos: { x: pos.x, z: pos.z } });
}

export function homeSpot(zone: ZoneDef): Vec2 {
  const spot: ZonePoint = zone.portalSpot ?? zone.waypoint ?? zone.playerStart;
  return { x: spot.x, z: spot.z };
}

function homeRespawn(zone: ZoneDef): RespawnPoint {
  return zone.waypoint === null ? { type: 'start' } : { type: 'waypoint' };
}

export function portalEnds(world: World): PortalEnd[] {
  const portal: PortalState | null = world.portal;
  if (portal === null) return [];
  if (world.zone.id === portal.zone) return [{ kind: 'out', zone: portal.zone, pos: { x: portal.pos.x, z: portal.pos.z }, reach: portal.reach }];
  const town: ZoneDef = townZone(world.content);
  return world.zone.id === town.id ? [{ kind: 'home', zone: town.id, pos: homeSpot(town), reach: portal.reach }] : [];
}

export function portalEndHere(world: World): PortalEnd | null {
  return portalEnds(world)[0] ?? null;
}

export function portalNear(world: World, point: Vec2): PortalEnd | null {
  const end: PortalEnd | null = portalEndHere(world);
  return end !== null && distance(point, end.pos) <= end.reach ? end : null;
}

function bossRoused(world: World): boolean {
  return world.monsters.some((monster: MonsterState): boolean => monster.alive && monster.aggro && monster.def.boss !== null);
}

export function closePortal(world: World): void {
  const portal: PortalState | null = world.portal;
  if (portal === null) return;
  world.portal = null;
  mark(world, 'closed', portal.zone, portal.pos);
}

export function openPortal(world: World, reach: number): void {
  closePortal(world);
  const pos: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  world.portal = { zone: world.zone.id, pos, respawn: world.respawn, reach, kept: null };
  mark(world, 'opened', world.zone.id, pos);
}

function channel(world: World, item: ItemInstance, use: ItemUse): void {
  const player: PlayerState = world.player;
  if (world.zone.kind === 'town') {
    world.events.push({ type: 'notice', reason: 'portal_town' });
    return;
  }
  if (bossRoused(world)) {
    world.events.push({ type: 'notice', reason: 'portal_boss' });
    return;
  }
  player.intent = { type: 'portal_channel', uid: item.uid, life: player.life, reach: use.reach, left: use.channel };
  player.path = [];
  player.moving = false;
  mark(world, 'channel', world.zone.id, player.pos);
}

export function useItem(world: World, inventoryIndex: number): void {
  const player: PlayerState = world.player;
  const item: ItemInstance | null = player.inventory[inventoryIndex] ?? null;
  const base: ItemBaseDef | null = item === null ? null : baseOf(world.content, item);
  if (!player.alive || item === null || base === null || base.use === null) return;
  channel(world, item, base.use);
}

export function stepChannel(world: World, intent: PortalChannelIntent, dt: number): void {
  const player: PlayerState = world.player;
  if (!player.alive || player.life < intent.life || bossRoused(world)) {
    player.intent = { type: 'idle' };
    mark(world, 'broken', world.zone.id, player.pos);
    return;
  }
  intent.left -= dt;
  if (intent.left > 0) return;
  player.intent = { type: 'idle' };
  const index: number = player.inventory.findIndex((item: ItemInstance | null): boolean => item !== null && item.uid === intent.uid);
  if (index < 0) return;
  takeOne(world.content, player.inventory, index);
  world.events.push({ type: 'character_changed' });
  openPortal(world, intent.reach);
}

function arrive(world: World, pos: Vec2): void {
  const player: PlayerState = world.player;
  player.pos = { x: pos.x, z: pos.z };
  player.path = [];
  player.moving = false;
  player.intent = { type: 'idle' };
}

function goHome(world: World, portal: PortalState): void {
  const town: ZoneDef = townZone(world.content);
  const from: string = world.zone.id;
  enterZone(world, town, homeRespawn(town), true);
  const spot: Vec2 = homeSpot(town);
  arrive(world, { x: spot.x, z: spot.z + PORTAL.arriveOffset });
  world.events.push({ type: 'zone_changed', from, to: town.id });
  mark(world, 'entered', from, portal.pos);
  mark(world, 'arrived', town.id, spot);
}

function goBack(world: World, portal: PortalState): void {
  const target: ZoneDef | undefined = world.content.zones.get(portal.zone);
  if (target === undefined) {
    closePortal(world);
    return;
  }
  const from: string = world.zone.id;
  const spot: Vec2 = homeSpot(world.zone);
  enterZone(world, target, portal.respawn);
  arrive(world, portal.pos);
  world.portal = null;
  world.events.push({ type: 'zone_changed', from, to: target.id });
  mark(world, 'entered', from, spot);
  mark(world, 'arrived', target.id, portal.pos);
  mark(world, 'closed', target.id, portal.pos);
}

export function goThrough(world: World, end: PortalEnd): void {
  const portal: PortalState | null = world.portal;
  if (portal === null || !world.player.alive) return;
  switch (end.kind) {
    case 'out':
      goHome(world, portal);
      return;
    case 'home':
      goBack(world, portal);
      return;
  }
}
