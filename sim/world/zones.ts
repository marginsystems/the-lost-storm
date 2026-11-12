import { ContentError } from '../content/read.ts';
import type { Content, ZoneCheckpoint, ZoneDef, ZoneExit, ZonePoint } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { buildNavGrid } from '../nav/grid.ts';
import { closeDialogue, spawnNpcs } from './dialogue.ts';
import { dropOnGround } from './ground.ts';
import { spawnPacks } from './monsters.ts';
import { clearProjectiles } from './skills.ts';
import type { GroundItem, ItemInstance, PlayerState, RespawnPoint, World } from './types.ts';
import { beginVoid } from './void.ts';

export function startZone(content: Content): ZoneDef {
  const zone: ZoneDef | undefined = content.zones.get(content.world.start);
  if (zone === undefined) throw new ContentError('world.start', `unknown zone ${content.world.start}`);
  return zone;
}

export function townZone(content: Content): ZoneDef {
  const zone: ZoneDef | undefined = content.zones.get(content.world.town);
  if (zone === undefined) throw new ContentError('world.town', `unknown zone ${content.world.town}`);
  return zone;
}

export function findExit(zone: ZoneDef, exitId: string): ZoneExit | null {
  return zone.exits.find((exit: ZoneExit): boolean => exit.id === exitId) ?? null;
}

export function findCheckpoint(zone: ZoneDef, checkpointId: string): ZoneCheckpoint | null {
  return zone.checkpoints.find((checkpoint: ZoneCheckpoint): boolean => checkpoint.id === checkpointId) ?? null;
}

function anchorOf(zone: ZoneDef, respawn: RespawnPoint): ZonePoint | null {
  let anchor: ZonePoint | null;
  switch (respawn.type) {
    case 'start':
      anchor = zone.playerStart;
      break;
    case 'exit':
      anchor = findExit(zone, respawn.exit)?.arrival ?? null;
      break;
    case 'checkpoint':
      anchor = findCheckpoint(zone, respawn.checkpoint);
      break;
    case 'waypoint':
      anchor = zone.waypoint;
      break;
  }
  return anchor;
}

export function respawnExists(zone: ZoneDef, respawn: RespawnPoint): boolean {
  return anchorOf(zone, respawn) !== null;
}

export function respawnPosition(zone: ZoneDef, respawn: RespawnPoint): Vec2 {
  const anchor: ZonePoint = anchorOf(zone, respawn) ?? zone.playerStart;
  return { x: anchor.x, z: anchor.z };
}

export function placePlayer(world: World): void {
  const player: PlayerState = world.player;
  player.pos = respawnPosition(world.zone, world.respawn);
  player.knock = { x: 0, z: 0 };
  player.intent = { type: 'idle' };
  player.path = [];
  player.queued = null;
  player.moving = false;
}

export function enterZone(world: World, zone: ZoneDef, respawn: RespawnPoint): void {
  closeDialogue(world, false);
  clearProjectiles(world);
  for (const monster of world.monsters) world.events.push({ type: 'monster_remove', monsterId: monster.id });
  world.monsters = [];
  world.spawnedPacks = [];
  const carried: ItemInstance[] = world.ground.flatMap((ground: GroundItem): ItemInstance[] => (ground.kept && ground.content.kind === 'item' ? [ground.content.item] : []));
  world.ground = [];
  world.surgeTimer = null;
  world.zone = zone;
  world.grid = buildNavGrid(zone, world.content.props, world.content.player.radius);
  world.respawn = respawn;
  if (!world.visited.includes(zone.id)) world.visited.push(zone.id);
  placePlayer(world);
  beginVoid(world);
  for (const item of carried) dropOnGround(world, world.player.pos, { kind: 'item', item }).kept = true;
  spawnNpcs(world);
  spawnPacks(world);
}

export function travelThrough(world: World, exit: ZoneExit): void {
  const target: ZoneDef | undefined = world.content.zones.get(exit.to);
  if (target === undefined) return;
  const from: string = world.zone.id;
  enterZone(world, target, { type: 'exit', exit: exit.toExit });
  world.events.push({ type: 'zone_changed', from, to: target.id });
}

export function stepCheckpoints(world: World): void {
  const player: PlayerState = world.player;
  for (const checkpoint of world.zone.checkpoints) {
    if (world.respawn.type === 'checkpoint' && world.respawn.checkpoint === checkpoint.id) continue;
    if (distance(player.pos, checkpoint) > checkpoint.radius) continue;
    world.respawn = { type: 'checkpoint', checkpoint: checkpoint.id };
    world.events.push({ type: 'checkpoint', checkpoint: checkpoint.id, pos: { x: checkpoint.x, z: checkpoint.z } });
  }
}
