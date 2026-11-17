import type { Content, ZoneDef } from '../sim/content/types.ts';
import { generateItem } from '../sim/items.ts';
import { createRng } from '../sim/rng.ts';
import { armedFlag } from '../sim/save-arm.ts';
import { parseSaveText, toSave } from '../sim/save.ts';
import type { SaveData } from '../sim/save.ts';
import { createWorld } from '../sim/world/create.ts';
import type { ItemInstance, World } from '../sim/world/types.ts';
import { roadContent, roadZone } from './road-support.ts';
import { must } from './support.ts';

const OUTPOST: ZoneDef = roadZone({
  id: 'outpost',
  waypoint: { x: 21, z: 8, radius: 1.8, marker: null },
  playerStart: { x: 28, z: 12 },
  exits: [{ id: 'stair', x: 28, z: 14.4, radius: 1.5, to: 'hall_of_time', toExit: 'west_gate', arrival: { x: 28, z: 12 }, requires: [], lockedHint: '', hiddenWhenLocked: false, look: 'ring', marker: null }],
  packs: [{ x: 12, z: 6, members: [{ monster: 'mended', count: 2, mods: [] }], when: [] }],
});
export const saveContent: Content = roadContent(OUTPOST);

export function made(base: string, rarity: string, uid: number): ItemInstance {
  return must(generateItem(saveContent, createRng(uid), uid, 3, base, rarity), base);
}

export function played(): World {
  const world: World = createWorld(saveContent, { seed: 1, save: null });
  const player = world.player;
  player.level = 4;
  player.xp = 17;
  player.gold = 123;
  player.kills = 9;
  player.skillPoints = 2;
  player.allocated = ['stone_thunderclap', 'tempered_body', 'blade_thunderhead', 'heavy_hands'];
  player.inventory[0] = made('drowned_leathers', 'rare', 5);
  player.inventory[3] = made('gale_charm', 'magic', 6);
  player.equipped.weapon = made('stormsteel_sword', 'rare', 7);
  world.surge = 3;
  world.nextItemUid = 40;
  world.flags[armedFlag('heavy')] = 'bag';
  return world;
}

export function roundTrip(world: World): SaveData {
  return must(parseSaveText(saveContent, JSON.stringify(toSave(world))), 'save');
}
