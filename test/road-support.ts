import { loadContent } from '../sim/content/content.ts';
import type { Content, SurfaceDef, ZoneDef } from '../sim/content/types.ts';
import { createWorld } from '../sim/world/create.ts';
import type { World } from '../sim/world/types.ts';
import { enterZone } from '../sim/world/zones.ts';
import { placedProp } from './motion-support.ts';
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

export const SCENE_BASE: ZoneDef = roadZone({ id: 'scene_base', floors: { '.': 'silt', ',': 'silt' }, name: 'Scene Base' });

export function roadAct(zones: readonly ZoneDef[], start: string, town: string = start): Content {
  const surfaces: Map<string, SurfaceDef> = new Map<string, SurfaceDef>([...ROAD_CONTENT.surfaces, ['road_firm', surfaceOf('road_firm', 1)], ['road_slow', surfaceOf('road_slow', 0.5)]]);
  const placed: Map<string, ZoneDef> = new Map<string, ZoneDef>([...ROAD_CONTENT.zones, ...zones.map((zone: ZoneDef): [string, ZoneDef] => [zone.id, zone])]);
  return { ...ROAD_CONTENT, surfaces, zones: placed, world: { ...ROAD_CONTENT.world, start, town } };
}

const OUTPOST_FIELD: readonly string[] = ['   wwwwwwww   ', ' wwwwwwwwwwww ', ' wwwwwwwwwwww ', 'wwwwwwwwwwwwww', 'wwwwwwwwwwwwww', 'wwwwwwwwwwwwww', 'wwwwwwwwwwwwww', 'wwwwwwwwwwwwww', ' wwwwwwwwwwww ', ' wwwwwwwwwwww ', '   wwwwwwww   '];
export const HUB_ZONE: ZoneDef = roadZone({
  id: 'hub',
  kind: 'town',
  tiles: ['wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww'],
  playerStart: { x: 8, z: 12 },
  exits: [{ id: 'outpost_stair', x: 26, z: 12, radius: 1.6, to: 'outpost', toExit: 'stair', arrival: { x: 22, z: 12 }, requires: [], lockedHint: '', hiddenWhenLocked: false, look: 'ring' }],
});
export const OUTPOST_ZONE: ZoneDef = roadZone({
  id: 'outpost',
  tiles: OUTPOST_FIELD,
  walls: { tall: ['mossy_wall_a', 'mossy_wall_b', 'mossy_wall_a', 'mossy_wall_ruin', 'mossy_wall_window'], low: 'mossy_wall_low', corner: 'mossy_pier', halfThickness: 0.5 },
  props: [placedProp('mossy_pillar', 20, 14), placedProp('mossy_pillar', 36, 14), placedProp('mossy_pillar', 20, 30), placedProp('mossy_pillar', 36, 30), placedProp('mossy_column', 14.5, 21), placedProp('mossy_column', 41.5, 23)],
  playerStart: { x: 28, z: 37 },
  packs: [
    { x: 12, z: 12, members: [{ monster: 'mended', count: 4, mods: [] }], when: [] },
    { x: 44, z: 12, members: [{ monster: 'mended', count: 3, mods: [] }, { monster: 'mender', count: 2, mods: [] }], when: [] },
    { x: 28, z: 15, members: [{ monster: 'mended', count: 2, mods: [] }, { monster: 'unfinished_brute', count: 3, mods: [] }], when: [] },
  ],
  surge: { delay: 5, surgesPerExtraMonster: 2, maxExtraMonsters: 3 },
  exits: [{ id: 'stair', x: 28, z: 41.6, radius: 1.5, to: 'hub', toExit: 'outpost_stair', arrival: { x: 28, z: 37 }, requires: [], lockedHint: '', hiddenWhenLocked: false, look: 'ring' }],
  waypoint: { x: 21, z: 37.5, radius: 1.8 },
});
export const OUTPOST_CONTENT: Content = roadAct([HUB_ZONE, OUTPOST_ZONE], 'hub');
