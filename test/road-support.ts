import { loadContent } from '../sim/content/content.ts';
import type { Content, SurfaceDef, ZoneDef } from '../sim/content/types.ts';
import { createWorld } from '../sim/world/create.ts';
import type { World } from '../sim/world/types.ts';
import { enterZone } from '../sim/world/zones.ts';
import { zoneOf } from './support.ts';

export const ROAD_CONTENT: Content = loadContent();

export const OPEN_FIELD: readonly string[] = ['wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww'];

export function roadZone(patch: Partial<ZoneDef>): ZoneDef {
  const base: ZoneDef = zoneOf(ROAD_CONTENT, ROAD_CONTENT.world.start);
  return {
    ...base,
    id: 'road_test',
    kind: 'wild',
    void: null,
    hud: null,
    tiles: OPEN_FIELD,
    floors: { w: 'road_firm', s: 'road_slow' },
    outside: null,
    walls: null,
    props: [],
    packs: [],
    npcs: [],
    exits: [],
    checkpoints: [],
    waypoint: null,
    voices: [],
    surge: null,
    drifts: [],
    triggers: [],
    playerStart: { x: 2, z: 2 },
    ...patch,
  };
}

function surfaceOf(id: string, pace: number): SurfaceDef {
  return { id, color: 'textures/dirt_color.webp', normal: null, orm: null, metres: 4, tint: '#ffffff', roughness: 1, metalness: 0, normalScale: 1, spill: 0, pace };
}

export function roadContent(zone: ZoneDef, extra: Partial<Content> = {}): Content {
  const surfaces: Map<string, SurfaceDef> = new Map<string, SurfaceDef>([...ROAD_CONTENT.surfaces, ['road_firm', surfaceOf('road_firm', 1)], ['road_slow', surfaceOf('road_slow', 0.5)]]);
  return { ...ROAD_CONTENT, surfaces, zones: new Map<string, ZoneDef>([...ROAD_CONTENT.zones, [zone.id, zone]]), ...extra };
}

export function roadWorld(zone: ZoneDef, extra: Partial<Content> = {}): World {
  const content: Content = roadContent(zone, extra);
  const world: World = createWorld(content, { seed: 7, save: null });
  enterZone(world, zone, { type: 'start' });
  world.events = [];
  world.monsters = [];
  return world;
}
