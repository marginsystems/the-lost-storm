import hall from '../data/zones/hall_of_time.json' with { type: 'json' };
import hideout from '../data/zones/hideout.json' with { type: 'json' };
import world from '../data/world.json' with { type: 'json' };

const FLOOR_ROWS: readonly string[] = hall.tiles.map((row: string): string => row.replace(/[^ ]/g, '.'));

export const WAYSTATION = {
  ...hideout,
  id: 'waystation',
  name: 'The Waystation',
  level: 2,
  exits: [{ id: 'west_gate', x: 1.6, z: 26, radius: 1.6, to: 'shallows', toExit: 'east', arrival: { x: 7, z: 26 } }],
};

export const SHALLOWS = {
  ...hall,
  id: 'shallows',
  name: 'The Shallows',
  kind: 'wild',
  level: 1,
  tiles: FLOOR_ROWS,
  floors: { '.': 'silt' },
  outside: { surface: 'silt', reach: 3, edge: null, barrier: null },
  props: [],
  packs: [{ x: 26, z: 30, members: [{ monster: 'mended', count: 2 }] }],
  exits: [{ id: 'east', x: 78.4, z: 30, radius: 1.6, to: 'waystation', toExit: 'west_gate', arrival: { x: 73, z: 30 } }],
  checkpoints: [],
  waypoint: null,
  npcs: [],
};

const ACT = world.acts[0];
const ATLAS = ACT?.atlas;

export const PAIR_WORLD = {
  ...world,
  start: 'shallows',
  town: 'waystation',
  acts: ACT === undefined || ATLAS === undefined ? [] : [{
    ...ACT,
    atlas: {
      ...ATLAS,
      places: [{ zone: 'shallows', x: 260, y: 560 }, { zone: 'waystation', x: 520, y: 520 }, ...ATLAS.places],
      roads: [{ from: 'shallows', to: 'waystation', via: [{ x: 390, y: 548 }] }, ...ATLAS.roads],
    },
  }],
  retired: { ...world.retired, zones: world.retired.zones.filter((zone: string): boolean => zone !== 'shallows' && zone !== 'waystation') },
};
