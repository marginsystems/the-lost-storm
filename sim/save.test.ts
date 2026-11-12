import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Content, ZoneDef, ZoneVoice } from './content/types.ts';
import { emptyEquipment, generateItem } from './items.ts';
import { createRng } from './rng.ts';
import { parseSaveText, readSave, SAVE_VERSION, toSave } from './save.ts';
import type { SaveData } from './save.ts';
import { createWorld } from './world/create.ts';
import type { ItemInstance, World } from './world/types.ts';

const content: Content = loadContent();

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
  player.allocated = ['tempered_body', 'heavy_hands'];
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
  assert.deepEqual(player.allocated, ['tempered_body', 'heavy_hands']);
  assert.deepEqual(player.inventory, original.player.inventory);
  assert.deepEqual(player.equipped, original.player.equipped);
  assert.equal(restored.surge, 3);
  assert.equal(restored.nextItemUid, 40);
  assert.equal(player.inventory.length, content.player.inventorySize);
  assert.equal(player.life, player.maxLife);
  assert.ok(player.stats.maxLife >= 100 + 12 * 3 + 30);
  assert.ok(restored.monsters.every((monster): boolean => monster.level === 3));
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

void test('items with unknown bases, rarities or affixes are dropped or cleaned', (): void => {
  const base: SaveData = toSave(played());
  const ghost: ItemInstance = { uid: 8, base: 'ghost_blade', rarity: 'common', level: 1, affixes: [] };
  const odd: ItemInstance = { uid: 9, base: 'rusted_blade', rarity: 'mythic', level: 1, affixes: [] };
  const mixed: ItemInstance = { uid: 10, base: 'rusted_blade', rarity: 'magic', level: 1, affixes: [{ affix: 'jagged', value: 2 }, { affix: 'made_up', value: 9 }] };
  const misplaced: ItemInstance = made('drowned_leathers', 'common', 11);
  const raw: unknown = JSON.parse(
    JSON.stringify({
      ...base,
      allocated: ['tempered_body', 'ghost_node', 7],
      inventory: [ghost, odd, mixed, 'junk', null],
      equipped: { weapon: misplaced, chest: null, charm: null },
    }),
  );
  const save: SaveData = must(readSave(content, raw), 'save');
  assert.deepEqual(save.allocated, ['tempered_body']);
  assert.equal(save.inventory[0], null);
  assert.equal(save.inventory[1], null);
  assert.deepEqual(must(save.inventory[2], 'mixed').affixes, [{ affix: 'jagged', value: 2 }]);
  assert.equal(save.inventory[3], null);
  assert.equal(save.equipped.weapon, null);
  assert.deepEqual(save.equipped.chest, misplaced);
  assert.equal(save.inventory.length, content.player.inventorySize);
  const world: World = createWorld(content, { seed: 1, save });
  assert.equal(world.player.inventory.filter((item: ItemInstance | null): boolean => item !== null).length, 1);
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
  world.ground.push({ id: 900, pos: { x: 0, z: 0 }, from: { x: 0, z: 0 }, content: { kind: 'item', item: made('gale_charm', 'common', 70) }, age: 0, kept: false });
  world.ground.push({ id: 901, pos: { x: 0, z: 0 }, from: { x: 0, z: 0 }, content: { kind: 'gold', amount: 5 }, age: 0, kept: true });
  assert.deepEqual(toSave(world).spilled, []);
});

void test('the zone, the respawn point and the zones visited survive a save', (): void => {
  const world: World = worldIn(content, 'drowned_bastion', 3);
  world.respawn = { type: 'exit', exit: 'stair' };
  const save: SaveData = roundTrip(world);
  assert.equal(save.zone, 'drowned_bastion');
  assert.deepEqual(save.respawn, { type: 'exit', exit: 'stair' });
  assert.deepEqual(save.visited, ['stillhold', 'drowned_bastion']);
  const restored: World = createWorld(content, { seed: 4, save });
  assert.equal(restored.zone.id, 'drowned_bastion');
  assert.deepEqual(restored.respawn, { type: 'exit', exit: 'stair' });
  assert.deepEqual(restored.player.pos, { x: 28, z: 37 });
  assert.deepEqual(restored.visited, ['stillhold', 'drowned_bastion']);
  assert.ok(restored.monsters.length > 0);
});

void test('a version 1 save, which has no zone, loads into the start zone with its character intact', (): void => {
  const { zone: _zone, respawn: _respawn, visited: _visited, ...old } = toSave(played());
  const save: SaveData = must(readSave(content, JSON.parse(JSON.stringify({ ...old, version: 1 }))), 'save');
  assert.equal(save.zone, content.world.start);
  assert.deepEqual(save.respawn, { type: 'start' });
  assert.deepEqual(save.visited, [content.world.start]);
  assert.equal(save.level, 4);
  assert.equal(save.surge, 3);
  const restored: World = createWorld(content, { seed: 5, save });
  assert.equal(restored.zone.id, content.world.start);
  assert.equal(restored.player.level, 4);
  assert.equal(restored.player.equipped.weapon?.base, 'stormsteel_sword');
  assert.equal(restored.monsters.length, 0);
});

void test('an unknown zone or respawn id in a save falls back to the start', (): void => {
  const base: SaveData = toSave(worldIn(content, 'drowned_bastion', 6));
  const lostZone: SaveData = must(readSave(content, { ...base, zone: 'atlantis', respawn: { type: 'exit', exit: 'stair' }, visited: ['atlantis', 'stillhold', 7] }), 'save');
  assert.equal(lostZone.zone, content.world.start);
  assert.deepEqual(lostZone.respawn, { type: 'start' });
  assert.deepEqual(lostZone.visited, ['stillhold']);
  const lostExit: SaveData = must(readSave(content, { ...base, respawn: { type: 'exit', exit: 'trapdoor' } }), 'save');
  const world: World = createWorld(content, { seed: 7, save: lostExit });
  assert.equal(world.zone.id, 'drowned_bastion');
  assert.deepEqual(world.respawn, { type: 'start' });
  assert.deepEqual(world.player.pos, { x: 28, z: 37 });
  const oddRespawn: SaveData = must(readSave(content, { ...base, respawn: { type: 'checkpoint' }, visited: 'everywhere' }), 'save');
  assert.deepEqual(oddRespawn.respawn, { type: 'start' });
  assert.deepEqual(oddRespawn.visited, ['drowned_bastion']);
});

void test('the conversations and the voices of a place already heard survive a save, and unknown ones are dropped', (): void => {
  const voice: string = must([...content.zones.values()].flatMap((zone: ZoneDef): readonly ZoneVoice[] => zone.voices)[0], 'a zone voice').id;
  const world: World = createWorld(content, { seed: 8, save: null });
  world.heard = ['maren_wake', 'hale_first', voice];
  const save: SaveData = roundTrip(world);
  assert.deepEqual(save.heard, ['maren_wake', 'hale_first', voice]);
  assert.deepEqual(createWorld(content, { seed: 9, save }).heard, ['maren_wake', 'hale_first', voice]);
  const { heard: _heard, ...older } = toSave(world);
  assert.deepEqual(must(readSave(content, older), 'save').heard, []);
  assert.deepEqual(must(readSave(content, { ...toSave(world), heard: ['maren_wake', 'a_rumour', 4] }), 'save').heard, ['maren_wake']);
  assert.deepEqual(must(readSave(content, { ...toSave(world), heard: 'everything' }), 'save').heard, []);
});

void test('quest progress and unlocked waypoints survive a save, and bad entries are cleaned', (): void => {
  const world: World = createWorld(content, { seed: 10, save: null });
  world.quests = { fallen_in: 1 };
  world.waypoints = ['stillhold', 'drowned_bastion'];
  const save: SaveData = roundTrip(world);
  assert.deepEqual(save.quests, { fallen_in: 1 });
  assert.deepEqual(save.waypoints, ['stillhold', 'drowned_bastion']);
  const restored: World = createWorld(content, { seed: 11, save });
  assert.deepEqual(restored.quests, { fallen_in: 1 });
  assert.deepEqual(restored.waypoints, ['stillhold', 'drowned_bastion']);
  const messy: SaveData = must(readSave(content, { ...toSave(world), quests: { fallen_in: 99, a_rumour: 1, also: 'no' }, waypoints: ['stillhold', 'atlantis', 7] }), 'save');
  assert.deepEqual(messy.quests, { fallen_in: must(content.quests.get('fallen_in'), 'quest').objectives.length });
  assert.deepEqual(messy.waypoints, ['stillhold']);
  assert.deepEqual(must(readSave(content, { ...toSave(world), quests: { fallen_in: -1 } }), 'save').quests, {});
});

void test('a save from before quests keeps the hero and starts the quests from the beginning', (): void => {
  const { quests: _quests, waypoints: _waypoints, ...older } = toSave(played());
  const save: SaveData = must(readSave(content, JSON.parse(JSON.stringify(older))), 'save');
  assert.deepEqual(save.quests, {});
  assert.deepEqual(save.waypoints, []);
  assert.equal(save.level, 4);
  const world: World = createWorld(content, { seed: 12, save });
  assert.deepEqual(world.quests, { fallen_in: 0 });
  assert.equal(world.player.level, 4);
  assert.equal(readSave(content, { ...older, version: SAVE_VERSION + 1 }), null);
});

void test('a hero who teleported keeps the waypoint as the place to return to after a reload', (): void => {
  const world: World = worldIn(content, 'drowned_bastion', 14);
  world.respawn = { type: 'waypoint' };
  const save: SaveData = roundTrip(world);
  assert.deepEqual(save.respawn, { type: 'waypoint' });
  const restored: World = createWorld(content, { seed: 15, save });
  assert.deepEqual(restored.respawn, { type: 'waypoint' });
  const waypoint = must(restored.zone.waypoint, 'waypoint');
  assert.deepEqual(restored.player.pos, { x: waypoint.x, z: waypoint.z });
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
  const save: SaveData = must(readSave(content, older), 'save');
  assert.equal(save.version, SAVE_VERSION);
  assert.equal(SAVE_VERSION, 3);
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
