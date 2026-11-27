import type { PorterDef } from '../content/trade-types.ts';
import { matchLoot } from '../loot-filter.ts';
import { distance } from '../math.ts';
import type { Vec2 } from '../math.ts';
import { lineWalkable } from '../nav/grid.ts';
import { findPath } from '../nav/path.ts';
import { npcAt } from './dialogue.ts';
import { removeGround } from './ground.ts';
import type { GroundItem, NpcState, World } from './types.ts';

export type PorterSteering = (world: World, porter: NpcState, interval: number) => void;

const PORTER = { routeInterval: 0.35, landed: 0.45, catchUpFactor: 1.7 } as const;

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
      && distance(npc.pos, ground.pos) > def.pickupReach) return false;
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
    return;
  }
  if (world.time >= world.porterNextRoute) planRoute(world, porter, def);
  if (porter.route.length > 0) steer?.(world, porter, PORTER.routeInterval);
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
  porter.pace = fetch === null ? Math.max(def.pace, world.player.stats.moveSpeed * PORTER.catchUpFactor) : def.pace;
}

function followRoute(world: World, porter: NpcState, hero: Vec2, gap: number): Vec2[] {
  if (distance(porter.pos, hero) <= gap && lineWalkable(world.grid, porter.pos, hero)) return [];
  const route: Vec2[] = findPath(world.grid, porter.pos, hero);
  const end = route.at(-1);
  if (world.player.moving || end === undefined || distance(end, hero) > gap) return route;
  const lastTurn = route.at(-2) ?? porter.pos;
  const length: number = distance(lastTurn, end);
  if (length <= gap) route.pop();
  else route[route.length - 1] = { x: end.x + (lastTurn.x - end.x) * gap / length, z: end.z + (lastTurn.z - end.z) * gap / length };
  return route;
}
