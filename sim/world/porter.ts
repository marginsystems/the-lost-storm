import type { PorterDef } from '../content/trade-types.ts';
import { matchLoot } from '../loot-filter.ts';
import { clamp, distance, lerp } from '../math.ts';
import type { Vec2 } from '../math.ts';
import { lineWalkable } from '../nav/grid.ts';
import { findPath } from '../nav/path.ts';
import { npcAt } from './dialogue.ts';
import { removeGround } from './ground.ts';
import { pathLength } from './stick.ts';
import type { GroundItem, NpcState, World } from './types.ts';

export type PorterSteering = (world: World, porter: NpcState, interval: number) => void;

export const PORTER = {
  routeInterval: 0.35,
  landed: 0.45,
  gleanReach: 3,
  closeFactor: 0.9,
  leadFactor: 1.15,
  leadOver: 3,
  resumeSlack: 1.5,
  rushFactor: 1.5,
  rushFrom: 5,
  rushAt: 14,
  acceleration: 10,
} as const;

interface FetchRoute {
  readonly ground: GroundItem;
  readonly path: Vec2[];
  readonly arrived: boolean;
}

function fetchRoute(world: World, npc: NpcState, def: PorterDef): FetchRoute | null {
  if (!world.satchel.includes(null)) return null;
  const candidates = world.ground.filter((ground: GroundItem): boolean => {
    if (ground.age < PORTER.landed || ground.kept || ground.discarded === true || ground.find !== null || ground.content.kind !== 'item') return false;
    if (ground.id !== world.porterTarget && distance(world.player.pos, ground.pos) > def.searchRadius
      && distance(npc.pos, ground.pos) > Math.max(def.pickupReach, PORTER.gleanReach)) return false;
    const match = matchLoot(world.content, world.lootFilter, ground.content.item);
    return match === 'ordinary' || match === 'wanted';
  });
  candidates.sort((a: GroundItem, b: GroundItem): number => {
    const priority: number = Number(b.id === world.porterTarget) - Number(a.id === world.porterTarget);
    return priority !== 0 ? priority : distance(npc.pos, a.pos) - distance(npc.pos, b.pos);
  });
  for (const ground of candidates) {
    if (distance(npc.pos, ground.pos) <= def.pickupReach && lineWalkable(world.grid, npc.pos, ground.pos)) return { ground, path: [], arrived: true };
    const path: Vec2[] = findPath(world.grid, npc.pos, ground.pos);
    const last = path.at(-1);
    if (last !== undefined && distance(last, ground.pos) <= def.pickupReach && lineWalkable(world.grid, last, ground.pos)) return { ground, path, arrived: false };
  }
  return null;
}

export function stepPorter(world: World, steer?: PorterSteering): void {
  const def: PorterDef = world.content.trade.porter;
  if (world.porterUntil <= world.now || world.zone.duel !== null) {
    if (world.porter !== null) {
      world.npcs = world.npcs.filter((npc: NpcState): boolean => npc !== world.porter);
      if (world.service?.kind === 'porter') world.service = null;
      world.porter = null;
    }
    return;
  }
  if (world.zone.npcs.some((placed): boolean => placed.npc === def.npc)) return;
  const hero: Vec2 = world.player.pos;
  if (world.porter === null) {
    const npc = npcAt(world, { npc: def.npc, ...hero, facingDegrees: 0, when: [], leave: 0 });
    if (npc === null) return;
    world.porter = npc;
    world.npcs = [...world.npcs, npc];
    world.porterNextRoute = 0;
    world.porterTarget = null;
  }
  const porter: NpcState = world.porter;
  if (!world.player.alive || world.service?.kind === 'porter') {
    porter.route = [];
    porter.pace = 0;
    return;
  }
  if (world.time >= world.porterNextRoute || leftBehind(world, porter, def)) planRoute(world, porter, def);
  if (closeToStill(world, porter, def)) {
    porter.route = [];
    porter.pace = 0;
  }
  if (porter.route.length > 0) steer?.(world, porter, PORTER.routeInterval);
}

function leftBehind(world: World, porter: NpcState, def: PorterDef): boolean {
  return porter.pace === 0 && porter.route.length === 0 && distance(porter.pos, world.player.pos) > def.followGap + PORTER.resumeSlack;
}

function closeToStill(world: World, porter: NpcState, def: PorterDef): boolean {
  if (world.porterTarget !== null || world.player.moving || porter.route.length === 0) return false;
  return distance(porter.pos, world.player.pos) <= def.followGap && lineWalkable(world.grid, porter.pos, world.player.pos);
}

function planRoute(world: World, porter: NpcState, def: PorterDef): void {
  const hero = world.player.pos;
  world.porterNextRoute = world.time + PORTER.routeInterval;
  const fetch = fetchRoute(world, porter, def);
  world.porterTarget = fetch !== null && !fetch.arrived ? fetch.ground.id : null;
  if (fetch !== null) {
    if (fetch.arrived && fetch.ground.content.kind === 'item') {
      world.satchel[world.satchel.indexOf(null)] = fetch.ground.content.item;
      removeGround(world, fetch.ground.id);
      world.events.push({ type: 'character_changed' });
    }
    porter.route = fetch.path;
  } else {
    porter.route = followRoute(world, porter, hero, def.followGap);
  }
  const target: number = fetch === null ? followPace(world, porter, def) : def.pace;
  const change: number = PORTER.acceleration * PORTER.routeInterval;
  porter.pace = porter.route.length === 0 ? 0 : clamp(target, porter.pace - change, porter.pace + change);
}

export function followFactor(behind: number, gap: number): number {
  if (behind <= 0) return lerp(1, PORTER.closeFactor, clamp(-behind / gap, 0, 1));
  const lead: number = lerp(1, PORTER.leadFactor, clamp(behind / PORTER.leadOver, 0, 1));
  const rush: number = clamp((behind - PORTER.rushFrom) / (PORTER.rushAt - PORTER.rushFrom), 0, 1);
  return lead + (PORTER.rushFactor - PORTER.leadFactor) * rush * rush * (3 - 2 * rush);
}

function followPace(world: World, porter: NpcState, def: PorterDef): number {
  const length: number = pathLength(porter.pos, porter.route);
  const behind: number = world.player.moving ? length - def.followGap : length;
  return Math.max(def.pace, world.player.stats.moveSpeed) * followFactor(behind, def.followGap);
}

function followRoute(world: World, porter: NpcState, hero: Vec2, gap: number): Vec2[] {
  const standing: boolean = porter.pace === 0 && porter.route.length === 0;
  if (standing && distance(porter.pos, hero) <= gap + PORTER.resumeSlack && lineWalkable(world.grid, porter.pos, hero)) return [];
  if (distance(porter.pos, hero) <= gap && lineWalkable(world.grid, porter.pos, hero)) return world.player.moving ? [{ x: hero.x, z: hero.z }] : [];
  const route: Vec2[] = findPath(world.grid, porter.pos, hero);
  const end = route.at(-1);
  if (world.player.moving || end === undefined || distance(end, hero) > gap) return route;
  const lastTurn = route.at(-2) ?? porter.pos;
  const length: number = distance(lastTurn, end);
  if (length <= gap) route.pop();
  else route[route.length - 1] = { x: end.x + (lastTurn.x - end.x) * gap / length, z: end.z + (lastTurn.z - end.z) * gap / length };
  return route;
}
