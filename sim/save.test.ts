import assert from 'node:assert/strict';
import { test } from 'node:test';
import { roadContent, roadZone } from '../test/road-support.ts';
import { must, worldIn } from '../test/support.ts';
import type { Content, ZoneDef, ZoneVoice } from './content/types.ts';
import { emptyEquipment, generateItem } from './items.ts';
import { createRng } from './rng.ts';
import { parseSaveText, readSave, SAVE_VERSION, toSave } from './save.ts';
import type { SaveData } from './save.ts';
import { createWorld } from './world/create.ts';
import type { ItemInstance, World } from './world/types.ts';

const OUTPOST: ZoneDef = roadZone({
  id: 'outpost',
  waypoint: { x: 21, z: 8, radius: 1.8 },
  playerStart: { x: 28, z: 12 },
  exits: [{ id: 'stair', x: 28, z: 14.4, radius: 1.5, to: 'hall_of_time', toExit: 'west_gate', arrival: { x: 28, z: 12 }, requires: [], lockedHint: '', hiddenWhenLocked: false, look: 'ring' }],
  packs: [{ x: 12, z: 6, members: [{ monster: 'mended', count: 2, mods: [] }], when: [] }],
});
const content: Content = roadContent(OUTPOST);

function made(base: string, rarity: string, uid: number): ItemInstance {
  return must(generateItem(content, createRng(uid), uid, 3, base, rarity), base);
}

function played(): World {
  const world: World = createWorld(content, { seed: 1, save: null });
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
  return world;
}

function roundTrip(world: World): SaveData {
  return must(parseSaveText(content, JSON.stringify(toSave(world))), 'save');
}

void test('a save survives JSON and rebuilds the same character', (): void => {
  const original: World = played();
  const save: SaveData = roundTrip(original);
  assert.equal(save.version, SAVE_VERSION);
  const restored: World = createWorld(content, { seed: 99, save });
  const player = restored.player;
  assert.equal(player.level, 4);
  assert.equal(player.xp, 17);
  assert.equal(player.gold, 123);
  assert.equal(player.kills, 9);
  assert.equal(player.skillPoints, 2);
  assert.deepEqual(player.allocated, ['stone_thunderclap', 'tempered_body', 'blade_thunderhead', 'heavy_hands']);
  assert.ok(player.learned.includes('thunderclap') && player.learned.includes('thunderhead'));
  assert.deepEqual(player.inventory, original.player.inventory);
  assert.deepEqual(player.equipped, original.player.equipped);
  assert.equal(restored.surge, 3);
  assert.equal(restored.nextItemUid, 40);
  assert.equal(player.inventory.length, content.player.inventorySize);
  assert.equal(player.life, player.maxLife);
  assert.ok(player.stats.maxLife >= 100 + 12 * 3 + 30);
  assert.ok(restored.monsters.every((monster): boolean => monster.level === restored.zone.level));
});

void test('a save from before the ability places gives back the points of places it can no longer reach', (): void => {
  const old: World = played();
  old.player.allocated = ['tempered_body', 'stone_1', 'stone_thunderclap', 'blade_1'];
  const save: SaveData = roundTrip(old);
  assert.deepEqual(save.allocated, ['tempered_body', 'stone_1', 'stone_thunderclap']);
  assert.equal(save.skillPoints, 3);
});

void test('skills a save learned from the old offers keep their places, and one whose way is closed gives a point back', (): void => {
  const old: World = played();
  old.player.allocated = [];
  old.player.skillPoints = 0;
  old.player.learned = ['cleave', 'thunderclap', 'storm_bolt', 'living_wire'];
  const save: SaveData = roundTrip(old);
  assert.deepEqual(save.allocated, ['stone_thunderclap', 'storm_storm_bolt']);
  assert.ok(save.learned.includes('thunderclap') && save.learned.includes('storm_bolt') && !save.learned.includes('living_wire'));
  assert.equal(save.skillPoints, 1);
});

void test('a restored world does not hand out the starting items again', (): void => {
  const restored: World = createWorld(content, { seed: 1, save: roundTrip(played()) });
  const bases: string[] = restored.player.inventory.flatMap((item: ItemInstance | null): string[] => (item === null ? [] : [item.base]));
  assert.deepEqual(bases.toSorted(), ['drowned_leathers', 'gale_charm']);
});

void test('garbage, the wrong version and wrong shapes are rejected without throwing', (): void => {
  assert.equal(parseSaveText(content, null), null);
  assert.equal(parseSaveText(content, ''), null);
  assert.equal(parseSaveText(content, 'not json {'), null);
  assert.equal(parseSaveText(content, '[]'), null);
  assert.equal(parseSaveText(content, '42'), null);
  assert.equal(readSave(content, { ...toSave(played()), version: SAVE_VERSION + 1 }), null);
  assert.equal(readSave(content, { ...toSave(played()), level: 'high' }), null);
  assert.equal(readSave(content, { ...toSave(played()), gold: -5 }), null);
  assert.equal(readSave(content, { ...toSave(played()), inventory: 'bag' }), null);
});

void test('items with unknown bases or rarities are dropped, and one with a line that no longer exists has its lines rolled again', (): void => {
  const base: SaveData = toSave(played());
  const ghost: ItemInstance = { uid: 8, base: 'ghost_blade', rarity: 'common', level: 1, affixes: [] };
  const odd: ItemInstance = { uid: 9, base: 'rusted_blade', rarity: 'mythic', level: 1, affixes: [] };
  const mixed: ItemInstance = { uid: 10, base: 'rusted_blade', rarity: 'magic', level: 1, affixes: [{ affix: 'honed', value: 0.06 }, { affix: 'made_up', value: 9 }] };
  const kept: ItemInstance = { uid: 12, base: 'rusted_blade', rarity: 'magic', level: 1, affixes: [{ affix: 'honed', value: 0.06 }] };
  const misplaced: ItemInstance = made('drowned_leathers', 'common', 11);
  const raw: unknown = JSON.parse(
    JSON.stringify({
      ...base,
      allocated: ['stone_thunderclap', 'tempered_body', 'ghost_node', 7],
      inventory: [ghost, odd, mixed, 'junk', kept],
      equipped: { weapon: misplaced, chest: null, charm: null },
    }),
  );
  const save: SaveData = must(readSave(content, raw), 'save');
  assert.deepEqual(save.allocated, ['stone_thunderclap', 'tempered_body']);
  assert.equal(save.inventory[0], null);
  assert.equal(save.inventory[1], null);
  assert.deepEqual(must(save.inventory[2], 'mixed').affixes, must(generateItem(content, createRng(10), 10, 1, 'rusted_blade', 'magic'), 'reroll').affixes);
  assert.deepEqual(must(save.inventory[4], 'kept').affixes, kept.affixes);
  assert.equal(save.inventory[3], null);
  assert.equal(save.equipped.weapon, null);
  assert.deepEqual(save.equipped.chest, misplaced);
  assert.equal(save.inventory.length, content.player.inventorySize);
  const world: World = createWorld(content, { seed: 1, save });
  assert.equal(world.player.inventory.filter((item: ItemInstance | null): boolean => item !== null).length, 2);
});

void test('a level above the maximum is clamped and fractions are floored', (): void => {
  const save: SaveData = must(readSave(content, { ...toSave(played()), level: 999, surge: 2.9, skillPoints: 1.8 }), 'save');
  assert.equal(save.level, content.player.xp.maxLevel);
  assert.equal(save.surge, 2);
  assert.equal(save.skillPoints, 1);
});

function versionOne(equipped: Readonly<Record<string, ItemInstance | null>>, inventory: readonly (ItemInstance | null)[]): unknown {
  const { spilled: _spilled, ...rest } = toSave(played());
  return JSON.parse(JSON.stringify({ ...rest, version: 1, equipped, inventory }));
}

function full(firstUid: number): ItemInstance[] {
  return Array.from({ length: content.player.inventorySize }, (_: unknown, index: number): ItemInstance => made('gale_charm', 'common', firstUid + index));
}

void test('a version 1 save keeps the item from the removed armour slot', (): void => {
  const sword: ItemInstance = made('stormsteel_sword', 'rare', 21);
  const leathers: ItemInstance = made('drowned_leathers', 'magic', 22);
  const charm: ItemInstance = made('ember_charm', 'common', 23);
  const save: SaveData = must(readSave(content, versionOne({ weapon: sword, armour: leathers, charm }, [])), 'save');
  assert.equal(save.version, SAVE_VERSION);
  assert.deepEqual(save.equipped, { ...emptyEquipment(), weapon: sword, chest: leathers, charm });
  assert.deepEqual(save.spilled, []);
  assert.ok(save.inventory.every((item: ItemInstance | null): boolean => item === null));
  const world: World = createWorld(content, { seed: 3, save });
  assert.deepEqual(world.player.equipped.chest, leathers);
  assert.equal(world.ground.length, 0);
  assert.deepEqual(roundTrip(world).equipped, save.equipped);
});

void test('an item whose slot is taken goes to the inventory, and to the ground only when that is full', (): void => {
  const sword: ItemInstance = made('stormsteel_sword', 'rare', 31);
  const spare: ItemInstance = made('rusted_blade', 'common', 32);
  const roomy: SaveData = must(readSave(content, versionOne({ weapon: sword, armour: spare }, [null, made('gale_charm', 'common', 33)])), 'roomy');
  assert.deepEqual(roomy.equipped.weapon, sword);
  assert.deepEqual(roomy.inventory[0], spare);
  assert.deepEqual(roomy.spilled, []);

  const packed: SaveData = must(readSave(content, versionOne({ weapon: sword, armour: spare }, full(40))), 'packed');
  assert.deepEqual(packed.equipped.weapon, sword);
  assert.deepEqual(packed.spilled, [spare]);
  assert.ok(packed.inventory.every((item: ItemInstance | null): boolean => item !== null && item.uid !== spare.uid));
});

void test('a spilled item lies at the hero and stays in every save until it is picked up', (): void => {
  const sword: ItemInstance = made('stormsteel_sword', 'rare', 51);
  const spare: ItemInstance = made('rusted_blade', 'common', 52);
  const packed: SaveData = must(readSave(content, versionOne({ weapon: sword, armour: spare }, full(60))), 'packed');
  const world: World = createWorld(content, { seed: 5, save: packed });
  const dropped = must(world.ground[0], 'ground item');
  assert.equal(world.ground.length, 1);
  assert.equal(dropped.kept, true);
  assert.deepEqual(dropped.content, { kind: 'item', item: spare });

  const again: SaveData = roundTrip(world);
  assert.deepEqual(again.spilled, [spare]);
  const reloaded: World = createWorld(content, { seed: 6, save: again });
  assert.equal(reloaded.ground.length, 1);
  assert.deepEqual(must(reloaded.ground[0], 'ground item').content, { kind: 'item', item: spare });

  reloaded.ground = [];
  reloaded.player.inventory[0] = spare;
  assert.deepEqual(roundTrip(reloaded).spilled, []);
});

void test('loot that was never part of a save is not carried by it', (): void => {
  const world: World = played();
  world.ground.push({ id: 900, pos: { x: 0, z: 0 }, from: { x: 0, z: 0 }, content: { kind: 'item', item: made('gale_charm', 'common', 70) }, age: 0, kept: false, find: null });
  world.ground.push({ id: 901, pos: { x: 0, z: 0 }, from: { x: 0, z: 0 }, content: { kind: 'gold', amount: 5 }, age: 0, kept: true, find: null });
  assert.deepEqual(toSave(world).spilled, []);
});

void test('the zone, the respawn point and the zones visited survive a save', (): void => {
  const world: World = worldIn(content, 'outpost', 3);
  world.respawn = { type: 'exit', exit: 'stair' };
  const save: SaveData = roundTrip(world);
  assert.equal(save.zone, 'outpost');
  assert.deepEqual(save.respawn, { type: 'exit', exit: 'stair' });
  assert.deepEqual(save.visited, ['hall_of_time', 'outpost']);
  const restored: World = createWorld(content, { seed: 4, save });
  assert.equal(restored.zone.id, 'outpost');
  assert.deepEqual(restored.respawn, { type: 'exit', exit: 'stair' });
  assert.deepEqual(restored.player.pos, { x: 28, z: 12 });
  assert.deepEqual(restored.visited, ['hall_of_time', 'outpost']);
  assert.ok(restored.monsters.length > 0);
});

void test('a version 1 save, which has no zone, loads into the town with its character intact', (): void => {
  const { zone: _zone, respawn: _respawn, visited: _visited, ...old } = toSave(played());
  const save: SaveData = must(readSave(content, JSON.parse(JSON.stringify({ ...old, version: 1 }))), 'save');
  assert.equal(save.zone, content.world.town);
  assert.deepEqual(save.respawn, { type: 'start' });
  assert.deepEqual(save.visited, [content.world.town]);
  assert.equal(save.level, 4);
  assert.equal(save.surge, 3);
  const restored: World = createWorld(content, { seed: 5, save });
  assert.equal(restored.zone.id, content.world.town);
  assert.equal(restored.player.level, 4);
  assert.equal(restored.player.equipped.weapon?.base, 'stormsteel_sword');
  assert.equal(restored.monsters.length, 0);
});

void test('an unknown zone or respawn id in a save falls back to the start', (): void => {
  const base: SaveData = toSave(worldIn(content, 'outpost', 6));
  const lostZone: SaveData = must(readSave(content, { ...base, zone: 'atlantis', respawn: { type: 'exit', exit: 'stair' }, visited: ['atlantis', 'hall_of_time', 7] }), 'save');
  assert.equal(lostZone.zone, content.world.start);
  assert.deepEqual(lostZone.respawn, { type: 'start' });
  assert.deepEqual(lostZone.visited, ['hall_of_time']);
  const lostExit: SaveData = must(readSave(content, { ...base, respawn: { type: 'exit', exit: 'trapdoor' } }), 'save');
  const world: World = createWorld(content, { seed: 7, save: lostExit });
  assert.equal(world.zone.id, 'outpost');
  assert.deepEqual(world.respawn, { type: 'start' });
  assert.deepEqual(world.player.pos, { x: 28, z: 12 });
  const oddRespawn: SaveData = must(readSave(content, { ...base, respawn: { type: 'checkpoint' }, visited: 'everywhere' }), 'save');
  assert.deepEqual(oddRespawn.respawn, { type: 'start' });
  assert.deepEqual(oddRespawn.visited, ['outpost']);
});

void test('the conversations and the voices of a place already heard survive a save, and unknown ones are dropped', (): void => {
  const town: ZoneDef = must(content.zones.get('hall_of_time'), 'town');
  const whisper: ZoneVoice = { id: 'well_whisper', x: 36, z: 24, radius: 2, lines: ['warden_trader_first_1'], when: [] };
  const voiced: Content = { ...content, zones: new Map<string, ZoneDef>([...content.zones, [town.id, { ...town, voices: [whisper] }]]) };
  const voice: string = must([...voiced.zones.values()].flatMap((zone: ZoneDef): readonly ZoneVoice[] => zone.voices)[0], 'a zone voice').id;
  const world: World = createWorld(voiced, { seed: 8, save: null });
  world.heard = ['warden_trader_talk', 'warden_guide_talk', voice];
  const save: SaveData = must(parseSaveText(voiced, JSON.stringify(toSave(world))), 'save');
  assert.deepEqual(save.heard, ['warden_trader_talk', 'warden_guide_talk', voice]);
  assert.deepEqual(createWorld(voiced, { seed: 9, save }).heard, ['warden_trader_talk', 'warden_guide_talk', voice]);
  const { heard: _heard, ...older } = toSave(world);
  assert.deepEqual(must(readSave(voiced, older), 'save').heard, []);
  assert.deepEqual(must(readSave(voiced, { ...toSave(world), heard: ['warden_trader_talk', 'a_rumour', 4] }), 'save').heard, ['warden_trader_talk']);
  assert.deepEqual(must(readSave(voiced, { ...toSave(world), heard: 'everything' }), 'save').heard, []);
});

void test('quest progress and unlocked waypoints survive a save, and bad entries are cleaned', (): void => {
  const world: World = createWorld(content, { seed: 10, save: null });
  world.quests = { out_of_the_mist: 1, to_the_waystation: 0 };
  world.waypoints = ['hideout', 'outpost'];
  const save: SaveData = roundTrip(world);
  assert.deepEqual(save.quests, { out_of_the_mist: 1, to_the_waystation: 0 });
  assert.deepEqual(save.waypoints, ['hideout', 'outpost']);
  const restored: World = createWorld(content, { seed: 11, save });
  assert.deepEqual(restored.quests, { out_of_the_mist: 1, the_first_taker: 0 });
  assert.deepEqual(restored.waypoints, ['hideout', 'outpost']);
  const messy: SaveData = must(readSave(content, { ...toSave(world), quests: { out_of_the_mist: 99, a_rumour: 1, also: 'no' }, waypoints: ['hideout', 'atlantis', 7] }), 'save');
  assert.deepEqual(messy.quests, { out_of_the_mist: must(content.quests.get('out_of_the_mist'), 'quest').objectives.length });
  assert.deepEqual(messy.waypoints, ['hideout']);
  assert.deepEqual(must(readSave(content, { ...toSave(world), quests: { out_of_the_mist: -1 } }), 'save').quests, {});
});

void test('a save from before quests keeps the hero and starts the quests from the beginning', (): void => {
  const { quests: _quests, waypoints: _waypoints, ...older } = toSave(played());
  const save: SaveData = must(readSave(content, JSON.parse(JSON.stringify(older))), 'save');
  assert.deepEqual(save.quests, {});
  assert.deepEqual(save.waypoints, []);
  assert.equal(save.level, 4);
  const world: World = createWorld(content, { seed: 12, save });
  assert.deepEqual(world.quests, { out_of_the_mist: 0 });
  assert.equal(world.player.level, 4);
  assert.equal(readSave(content, { ...older, version: SAVE_VERSION + 1 }), null);
});

void test('a hero who teleported keeps the waypoint as the place to return to after a reload', (): void => {
  const world: World = worldIn(content, 'outpost', 14);
  world.respawn = { type: 'waypoint' };
  const save: SaveData = roundTrip(world);
  assert.deepEqual(save.respawn, { type: 'waypoint' });
  const restored: World = createWorld(content, { seed: 15, save });
  assert.deepEqual(restored.respawn, { type: 'waypoint' });
  const waypoint = must(restored.zone.waypoint, 'waypoint');
  assert.deepEqual(restored.player.pos, { x: waypoint.x, z: waypoint.z });
});

void test('flask charges survive a save, and a version 2 save from before flasks loads with them full', (): void => {
  const world: World = played();
  const red = must(world.player.flasks[0], 'life flask');
  red.charges = 4;
  const restored: World = createWorld(content, { seed: 2, save: roundTrip(world) });
  assert.equal(must(restored.player.flasks[0], 'restored life flask').charges, 4);
  const { flasks: _dropped, ...older } = toSave(played());
  const migrated: SaveData = must(readSave(content, JSON.parse(JSON.stringify({ ...older, version: 2 }))), 'version 2 save');
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(SAVE_VERSION, 6);
  assert.deepEqual(migrated.flasks, {});
  const loaded: World = createWorld(content, { seed: 2, save: migrated });
  assert.ok(loaded.player.flasks.every((flask): boolean => flask.charges === flask.def.maxCharges));
  assert.equal(loaded.player.level, 4);
});

void test('saved flask charges that are unknown, negative or too large are cleaned up', (): void => {
  const save: SaveData = must(readSave(content, { ...JSON.parse(JSON.stringify(toSave(played()))), flasks: { life_flask: 500, mana_flask: -3, made_up: 4 } }), 'save');
  assert.deepEqual(save.flasks, { life_flask: must(content.flasks[0], 'life').maxCharges });
});

void test('the stash survives a save slot for slot', (): void => {
  const world: World = played();
  const kept: ItemInstance = made('stormsteel_sword', 'rare', 60);
  world.stash[5] = kept;
  world.stash[content.trade.stashSize - 1] = made('gale_charm', 'magic', 61);
  const save: SaveData = roundTrip(world);
  assert.equal(save.stash.length, content.trade.stashSize);
  const restored: World = createWorld(content, { seed: 8, save });
  assert.deepEqual(restored.stash, world.stash);
  assert.deepEqual(restored.stash[5], kept);
});

void test('a version 2 save, which has no stash, loads as the current version with an empty stash', (): void => {
  const current: SaveData = toSave(played());
  const older: Record<string, unknown> = { ...current, version: 2 };
  delete older['stash'];
  delete older['vendors'];
  delete older['flasks'];
  const save: SaveData = must(readSave(content, older), 'save');
  assert.equal(save.version, SAVE_VERSION);
  assert.equal(SAVE_VERSION, 6);
  assert.equal(save.stash.length, content.trade.stashSize);
  assert.ok(save.stash.every((item: ItemInstance | null): boolean => item === null));
  assert.deepEqual(save.inventory, current.inventory);
  assert.equal(save.gold, current.gold);
  assert.deepEqual(createWorld(content, { seed: 4, save }).stash, save.stash);
});

void test('stash entries that are not items are emptied, and items past the stash size are spilled at the hero', (): void => {
  const extra: ItemInstance = made('drowned_leathers', 'magic', 70);
  const first: ItemInstance = made('stormsteel_sword', 'common', 71);
  const stash: unknown[] = [first, 'junk', { uid: 3 }, ...Array.from({ length: content.trade.stashSize - 3 }, (): null => null), extra];
  const save: SaveData = must(readSave(content, { ...toSave(played()), stash }), 'save');
  assert.deepEqual(save.stash[0], first);
  assert.equal(save.stash[1], null);
  assert.equal(save.stash[2], null);
  assert.equal(save.stash.length, content.trade.stashSize);
  assert.ok(save.spilled.some((item: ItemInstance): boolean => item.uid === extra.uid));
});

function vendorId(): string {
  const npc = [...content.npcs.values()].find((def): boolean => def.service === 'vendor');
  return must(npc, 'vendor').id;
}

void test('the stall stock and its buy-back row survive a save, so a reload in town does not restock', (): void => {
  const world: World = played();
  const stock: (ItemInstance | null)[] = [made('stormsteel_sword', 'magic', 80), null, made('gale_charm', 'rare', 81)];
  const sold: ItemInstance = made('drowned_leathers', 'common', 82);
  world.vendors[vendorId()] = { stock, buyback: [sold], stale: false };
  const restored: World = createWorld(content, { seed: 5, save: roundTrip(world) });
  const vendor = must(restored.vendors[vendorId()], 'vendor');
  assert.equal(vendor.stale, false);
  assert.equal(vendor.stock.length, content.trade.stockSize);
  assert.deepEqual(vendor.stock.slice(0, 3), stock);
  assert.deepEqual(vendor.buyback, [sold]);
});

void test('a version 3 save, which has no stall, loads as the current version with the stall rolled fresh', (): void => {
  const older: Record<string, unknown> = { ...toSave(played()), version: 3 };
  delete older['vendors'];
  delete older['stash'];
  const save: SaveData = must(readSave(content, older), 'save');
  assert.equal(save.version, SAVE_VERSION);
  assert.deepEqual(save.vendors, {});
  assert.ok(save.stash.every((item: ItemInstance | null): boolean => item === null));
  assert.deepEqual(save.flasks, toSave(played()).flasks);
});

void test('saved stalls of unknown or non-vendor characters are dropped, and a stall without a stock list restocks', (): void => {
  const vendors: Record<string, unknown> = { nobody: { stock: [], buyback: [], stale: false }, [vendorId()]: { buyback: ['junk'], stale: false } };
  const save: SaveData = must(readSave(content, { ...toSave(played()), vendors }), 'save');
  assert.deepEqual(Object.keys(save.vendors), [vendorId()]);
  assert.equal(save.vendors[vendorId()]?.stale, true);
  assert.deepEqual(save.vendors[vendorId()]?.buyback, []);
});

void test('story flags survive a save, and bad entries are dropped', (): void => {
  const world: World = played();
  world.flags['first_choice'] = 'took_journal';
  const save: SaveData = roundTrip(world);
  assert.equal(save.flags['first_choice'], 'took_journal');
  const dirty: SaveData = must(readSave(content, { ...toSave(world), flags: { first_choice: 'took_journal', broken: 7 } }), 'dirty save');
  assert.deepEqual(dirty.flags, { first_choice: 'took_journal', [content.player.dressedFlag]: 'yes' });
  assert.deepEqual(createWorld(content, { seed: 3, save }).flags, save.flags);
});

void test('a save from before story flags is a returning hero: the legacy flags mark the opening skipped, and a lost zone falls back to town', (): void => {
  const { flags: _dropped, ...older } = toSave(played());
  const migrated: SaveData = must(readSave(content, JSON.parse(JSON.stringify({ ...older, version: 4 }))), 'version 4 save');
  assert.equal(migrated.version, SAVE_VERSION);
  assert.deepEqual(migrated.flags, { ...content.world.legacyFlags, [content.player.dressedFlag]: 'yes' });
  const lost: SaveData = must(readSave(content, { ...older, version: 4, zone: 'nowhere' }), 'lost save');
  assert.equal(lost.zone, content.world.town);
  const current: SaveData = must(readSave(content, { ...older, version: SAVE_VERSION, flags: {} }), 'current save');
  assert.deepEqual(current.flags, { [content.player.dressedFlag]: 'yes' });
});

void test('a save in a retired zone loads where the retired zones lead, with the hero and the retirement flags', (): void => {
  const to: string = content.world.town;
  const retiring: Content = { ...content, world: { ...content.world, retired: { zones: ['gone_road'], to, flags: { rerouted: 'yes' } } } };
  const saved: SaveData = toSave(played());
  const moved: SaveData = must(readSave(retiring, { ...saved, zone: 'gone_road', respawn: { type: 'checkpoint', checkpoint: 'old' } }), 'retired save');
  assert.equal(moved.zone, to);
  assert.deepEqual(moved.respawn, { type: 'start' });
  assert.equal(moved.flags['rerouted'], 'yes');
  assert.equal(moved.level, saved.level);
  assert.deepEqual(moved.inventory, saved.inventory);
  const elsewhere: SaveData = must(readSave(retiring, { ...saved, zone: 'never_was' }), 'unknown save');
  assert.equal(elsewhere.flags['rerouted'], undefined);
});

void test('a save from before the traveller clothes were items gets them once, in its empty slots only', (): void => {
  const world: World = played();
  const kept: ItemInstance = made('drowned_leathers', 'magic', 90);
  world.player.equipped = { ...emptyEquipment(), chest: kept };
  const { [content.player.dressedFlag]: _given, ...older } = world.flags;
  const before: Record<string, unknown> = { ...toSave(world), flags: older };
  const save: SaveData = must(readSave(content, before), 'old save');
  assert.deepEqual(save.equipped.chest, kept);
  assert.equal(save.equipped.head, null);
  assert.equal(save.equipped.legs?.base, 'traveller_trousers');
  assert.equal(save.equipped.feet?.base, 'traveller_boots');
  assert.equal(save.equipped.weapon, null);
  assert.equal(save.equipped.hands, null);
  assert.equal(save.flags[content.player.dressedFlag], 'yes');
  const uids: number[] = [save.equipped.legs, save.equipped.feet].map((item: ItemInstance | null): number => must(item, 'starter').uid);
  assert.deepEqual(uids, [world.nextItemUid, world.nextItemUid + 1]);
  assert.equal(save.nextItemUid, world.nextItemUid + 2);
  const undressed: World = createWorld(content, { seed: 5, save });
  undressed.player.equipped = emptyEquipment();
  const again: SaveData = must(readSave(content, JSON.parse(JSON.stringify(toSave(undressed)))), 'second load');
  assert.deepEqual(again.equipped, emptyEquipment());
});

void test('a new hero starts bareheaded in the traveller coat, trousers and boots with the blade, already marked as dressed', (): void => {
  const world: World = createWorld(content, { seed: 9, save: null });
  assert.deepEqual([world.player.equipped.head?.base, world.player.equipped.chest?.base, world.player.equipped.legs?.base, world.player.equipped.feet?.base, world.player.equipped.weapon?.base], [undefined, 'traveller_coat', 'traveller_trousers', 'traveller_boots', 'rusted_blade']);
  assert.equal(world.flags[content.player.dressedFlag], 'yes');
  assert.ok(world.player.inventory.every((item: ItemInstance | null): boolean => item === null));
});
