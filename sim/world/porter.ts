import type { PorterDef } from '../content/trade-types.ts';
import { matchLoot } from '../loot-filter.ts';
import { distance } from '../math.ts';
import type { Vec2 } from '../math.ts';
import { lineWalkable } from '../nav/grid.ts';
import { findPath } from '../nav/path.ts';
import { npcAt } from './dialogue.ts';
import { removeGround } from './ground.ts';
import type { GroundItem, NpcState, World } from './types.ts';

const PORTER = { routeInterval: 0.35, landed: 0.45 } as const;

interface FetchRoute {
  readonly ground: GroundItem;
  readonly path: Vec2[];
  readonly arrived: boolean;
}

function fetchRoute(world: World, npc: NpcState, def: PorterDef): FetchRoute | null {
  if (!world.satchel.includes(null)) return null;
  const candidates = world.ground.filter((ground: GroundItem): boolean => {
    if (ground.age < PORTER.landed || ground.kept || ground.discarded === true || ground.find !== null || ground.content.kind !== 'item') return false;
    if (distance(world.player.pos, ground.pos) > def.searchRadius) return false;
    const match = matchLoot(world.content, world.lootFilter, ground.content.item);
    return match === 'ordinary' || match === 'wanted';
  });
  candidates.sort((a: GroundItem, b: GroundItem): number => distance(npc.pos, a.pos) - distance(npc.pos, b.pos));
  for (const ground of candidates) {
    if (distance(npc.pos, ground.pos) <= def.pickupReach && lineWalkable(world.grid, npc.pos, ground.pos)) return { ground, path: [], arrived: true };
    const path: Vec2[] = findPath(world.grid, npc.pos, ground.pos);
    const last = path.at(-1);
    if (last !== undefined && distance(last, ground.pos) <= def.pickupReach) return { ground, path, arrived: false };
  }
  return null;
}

export function stepPorter(world: World): void {
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
  }
  const porter: NpcState = world.porter;
  if (!world.player.alive || world.service?.kind === 'porter') {
    porter.route = [];
    return;
  }
  if (world.time < world.porterNextRoute) return;
  world.porterNextRoute = world.time + PORTER.routeInterval;
  const fetch = fetchRoute(world, porter, def);
  if (fetch !== null) {
    if (fetch.arrived && fetch.ground.content.kind === 'item') {
      world.satchel[world.satchel.indexOf(null)] = fetch.ground.content.item;
      removeGround(world, fetch.ground.id);
      world.events.push({ type: 'character_changed' });
    }
    porter.route = fetch.path;
  } else {
    porter.route = distance(porter.pos, hero) > def.followGap ? findPath(world.grid, porter.pos, hero) : [];
  }
  porter.pace = def.pace;
}
