import type { Content, ZoneDef } from '../sim/content/types.ts';
import { createWorld } from '../sim/world/create.ts';
import type { World } from '../sim/world/types.ts';
import { enterZone } from '../sim/world/zones.ts';

export function must<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) throw new Error(`missing ${label}`);
  return value;
}

export function zoneOf(content: Content, zoneId: string): ZoneDef {
  return must(content.zones.get(zoneId), `zone ${zoneId}`);
}

export function worldIn(content: Content, zoneId: string, seed: number): World {
  const world: World = createWorld(content, { seed, save: null });
  enterZone(world, zoneOf(content, zoneId), { type: 'start' });
  world.events = [];
  return world;
}
