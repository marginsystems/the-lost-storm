import type { Content, ZoneDef } from '../sim/content/types.ts';
import { stepWorld } from '../sim/world/step.ts';
import type { World } from '../sim/world/types.ts';
import { RL } from '../sim/rl/contract.ts';
import { zoneOf, worldIn } from './support.ts';

export const RING = {
  id: 'test_ring',
  from: 'hall_of_time',
  home: { zone: 'hideout', exit: 'west' },
  gap: 9,
  weapon: 'warden_broadsword',
} as const;

export function ringContent(content: Content): Content {
  const hall: ZoneDef = zoneOf(content, RING.from);
  const start = hall.playerStart;
  const ring: ZoneDef = { ...hall, id: RING.id, name: 'Test Ring', packs: [], surge: null, moments: null, scenes: [], voices: [], triggers: [], drifts: [], npcs: [], duel: { rival: { x: start.x + RING.gap, z: start.z }, home: RING.home, gear: 'own', heroDamage: 1 } };
  return { ...content, zones: new Map<string, ZoneDef>([...content.zones, [RING.id, ring]]) };
}

export function ringWorld(content: Content, seed: number, level: number): World {
  const world: World = worldIn(content, RING.id, seed);
  stepWorld(world, [{ type: 'bench', hero: { seed, level, weapon: RING.weapon, bar: ['cleave', null, null, null, null, 'dodge_roll'] } }], RL.tick);
  world.events = [];
  return world;
}
