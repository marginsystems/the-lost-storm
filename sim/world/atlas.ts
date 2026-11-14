import type { AtlasRoad, Content, MonsterDef, PackMember, ZoneDef, ZoneExit, ZonePack } from '../content/types.ts';
import { allHold } from './conditions.ts';
import type { World } from './types.ts';

export type ZoneMark = 'town' | 'wild' | 'boss' | 'void';
export type PlaceState = 'here' | 'visited' | 'reachable' | 'locked' | 'unknown';
export type RoadState = 'open' | 'locked' | 'hidden';

interface Way {
  readonly open: boolean;
  readonly hidden: boolean;
}

export function zoneMark(content: Content, zone: ZoneDef): ZoneMark {
  switch (zone.kind) {
    case 'town':
      return 'town';
    case 'void':
      return 'void';
    case 'wild':
      break;
  }
  const rules = (member: PackMember): boolean => {
    const monster: MonsterDef | undefined = content.monsters.get(member.monster);
    return monster !== undefined && monster.boss !== null;
  };
  return zone.packs.some((pack: ZonePack): boolean => pack.members.some(rules)) ? 'boss' : 'wild';
}

function knownWays(world: World, from: string, to: string): Way[] {
  const zone: ZoneDef | undefined = world.content.zones.get(from);
  if (zone === undefined || !world.visited.includes(from)) return [];
  return zone.exits
    .filter((exit: ZoneExit): boolean => exit.to === to)
    .map((exit: ZoneExit): Way => ({ open: allHold(world, exit.requires), hidden: exit.hiddenWhenLocked }))
    .filter((way: Way): boolean => way.open || !way.hidden);
}

function summed(ways: readonly Way[]): RoadState {
  if (ways.length === 0) return 'hidden';
  return ways.some((way: Way): boolean => way.open) ? 'open' : 'locked';
}

export function roadState(world: World, road: AtlasRoad): RoadState {
  return summed([...knownWays(world, road.from, road.to), ...knownWays(world, road.to, road.from)]);
}

export function placeState(world: World, zoneId: string): PlaceState {
  if (zoneId === world.zone.id) return 'here';
  if (world.visited.includes(zoneId)) return 'visited';
  const state: RoadState = summed(world.visited.flatMap((from: string): Way[] => knownWays(world, from, zoneId)));
  if (state === 'open') return 'reachable';
  return state === 'locked' ? 'locked' : 'unknown';
}
