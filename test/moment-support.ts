import type { MomentDef, MomentField, MomentLibrary } from '../sim/content/moment-types.ts';
import type { Content, ZoneDef } from '../sim/content/types.ts';
import type { Vec2 } from '../sim/math.ts';
import { kill } from '../sim/world/combat.ts';
import type { MomentState, MonsterState, World } from '../sim/world/types.ts';
import { roadContent, roadWorld, roadZone, ROAD_CONTENT } from './road-support.ts';

const ROW: string = 'w'.repeat(40);

export const FIELD_TILES: readonly string[] = Array.from({ length: 40 }, (): string => ROW);

export const QUIET: MomentDef = {
  id: 'test_quiet',
  name: 'A quiet moment',
  tint: '#ffb060',
  ground: 'dirt',
  light: '#ffd0a0',
  bright: false,
  radius: 5,
  lifetime: 30,
  awake: 6,
  turnChance: 0,
  props: [],
  echoes: [{ monster: 'unfinished_brute', x: 1, z: 0, facingDegrees: 90, pose: { clip: 'idle', at: 0.3 }, turns: false, look: null }],
  reward: { goldMin: 10, goldMax: 10, items: 1, itemChance: 1, rarity: null },
  chest: null,
};

export const CHESTED: MomentDef = {
  ...QUIET,
  id: 'test_chested',
  name: 'A quiet moment with a chest',
  chest: { x: 2, z: -2, rotationDegrees: 30, goldMin: 12, goldMax: 12 },
};

export const RAID: MomentDef = {
  ...QUIET,
  id: 'test_raid',
  name: 'A raid',
  turnChance: 1,
  awake: 20,
  echoes: [
    { monster: 'unfinished_taker', x: 1.5, z: 0, facingDegrees: 0, pose: { clip: 'run', at: 0.5 }, turns: true, look: null },
    { monster: 'unfinished_taker', x: -1.5, z: 0, facingDegrees: 0, pose: { clip: 'run', at: 0.2 }, turns: true, look: null },
    { monster: 'unfinished_thrower', x: 0, z: 2, facingDegrees: 180, pose: { clip: 'idle', at: 0 }, turns: false, look: null },
  ],
  reward: { goldMin: 20, goldMax: 40, items: 2, itemChance: 0.5, rarity: null },
  chest: { x: -2, z: 2, rotationDegrees: 0, goldMin: 15, goldMax: 15 },
};

export const FIELD: MomentField = {
  combat: true,
  areas: [{ x: 80, z: 80, radius: 70 }],
  clearance: { hero: 6, exits: 4, between: 3, safe: 0, packs: 0 },
  interval: { min: 4, max: 8 },
  start: 2,
  max: 4,
  table: [
    { moment: 'test_quiet', weight: 1 },
    { moment: 'test_raid', weight: 2 },
  ],
  sure: [],
  first: [],
  grace: 0,
  avoid: [],
  near: null,
};

export function momentLibrary(defs: readonly MomentDef[] = [QUIET, CHESTED, RAID]): MomentLibrary {
  return { ...ROAD_CONTENT.moments, defs: new Map<string, MomentDef>(defs.map((def: MomentDef): [string, MomentDef] => [def.id, def])) };
}

export function fieldZone(field: MomentField = FIELD): ZoneDef {
  return roadZone({ id: 'moment_field', tiles: FIELD_TILES, cellSize: 4, playerStart: { x: 80, z: 80 }, moments: field });
}

export function fieldContent(field: MomentField = FIELD, library: MomentLibrary = momentLibrary()): Content {
  return roadContent(fieldZone(field), { moments: library });
}

export function fieldWorld(field: MomentField = FIELD, library: MomentLibrary = momentLibrary()): World {
  const zone: ZoneDef = fieldZone(field);
  return roadWorld(zone, { moments: library });
}

export function echoesOf(world: World, moment: MomentState): MonsterState[] {
  const ids: Set<number> = new Set<number>(moment.figures.flatMap((figure): number[] => (figure.monsterId === null ? [] : [figure.monsterId])));
  return world.monsters.filter((monster: MonsterState): boolean => ids.has(monster.id));
}

export function slay(world: World, monsters: readonly MonsterState[]): void {
  for (const monster of monsters) if (monster.alive) kill(world, monster, { x: 0, z: 1 });
}

export function standAt(world: World, at: Vec2): void {
  world.player.pos = { x: at.x, z: at.z };
  world.player.path = [];
  world.player.intent = { type: 'idle' };
}
