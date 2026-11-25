import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OUTPOST_CONTENT, OUTPOST_ZONE } from '../test/road-support.ts';
import { armed, must, worldIn } from '../test/support.ts';
import type { Content, MonsterDef, QuestDef, ZoneDef, ZonePack } from './content/types.ts';
import { readSave, toSave } from './save.ts';
import type { SaveData } from './save.ts';
import { emptyTally, furthestZone, playerStats, questsDone, readTally, stepTally } from './tally.ts';
import type { PlayerStats } from './tally.ts';
import { createWorld } from './world/create.ts';
import { makeItem } from './world/ledger.ts';
import { stepWorld } from './world/step.ts';
import type { GroundItem, MonsterState, World, WorldEvent } from './world/types.ts';

const DT: number = 1 / 30;
const ROOM: string = 'tally_room';

function room(monster: string): Content {
  const packs: ZonePack[] = [{ x: 28, z: 14, members: [{ monster, count: 1, mods: [] }], when: [] }];
  const zone: ZoneDef = { ...OUTPOST_ZONE, id: ROOM, level: 2, surge: null, packs, exits: [], waypoint: null, moments: null };
  return { ...OUTPOST_CONTENT, zones: new Map<string, ZoneDef>([...OUTPOST_CONTENT.zones, [zone.id, zone]]) };
}

function bossId(content: Content): string {
  return must([...content.monsters.values()].find((monster: MonsterDef): boolean => monster.boss !== null), 'a boss').id;
}

const PLAIN: string = 'mended';

function sturdy(world: World): World {
  world.player.stats.maxLife = 100000;
  world.player.maxLife = 100000;
  world.player.life = 100000;
  return world;
}

function onlyMonster(world: World): MonsterState {
  return must(world.monsters[0], 'the monster');
}

function fightToDeath(world: World, monster: MonsterState): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let step: number = 0; step < 900 && monster.alive; step += 1) {
    monster.life = Math.min(monster.life, 1);
    world.player.pos = { x: monster.pos.x, z: monster.pos.z + 1.6 };
    const command = world.player.action === null ? [{ type: 'skill' as const, slot: 0, aim: monster.pos, targetId: monster.id }] : [];
    events.push(...stepWorld(world, command, DT));
  }
  return events;
}

function gold(world: World, amount: number): GroundItem {
  return { id: 900, pos: world.player.pos, from: world.player.pos, content: { kind: 'gold', amount }, find: null, age: 0, kept: false };
}

void test('a save from before the tally loads with every counter at zero and keeps its kills', (): void => {
  const world: World = createWorld(OUTPOST_CONTENT, { seed: 3, save: null });
  world.player.kills = 41;
  const { tally: _tally, ...old } = toSave(world);
  const save: SaveData = must(readSave(OUTPOST_CONTENT, JSON.parse(JSON.stringify(old))), 'save');
  assert.deepEqual(save.tally, emptyTally());
  assert.equal(save.kills, 41);
  const restored: World = createWorld(OUTPOST_CONTENT, { seed: 3, save });
  assert.deepEqual(restored.player.tally, emptyTally());
});

void test('the tally survives a save, and bad or unknown entries read as nothing', (): void => {
  const world: World = createWorld(OUTPOST_CONTENT, { seed: 3, save: null });
  const rarity: string = must(OUTPOST_CONTENT.rarities[1], 'second rarity').id;
  world.player.tally = { bosses: 2, deaths: 3, biggestHit: 410, goldLooted: 900, played: 75.5, moments: 4, restraint: 2, found: { [rarity]: 6 } };
  const save: SaveData = must(readSave(OUTPOST_CONTENT, JSON.parse(JSON.stringify(toSave(world)))), 'save');
  assert.deepEqual(save.tally, world.player.tally);
  const read = readTally(OUTPOST_CONTENT, { bosses: -1, deaths: 'two', biggestHit: Number.NaN, goldLooted: 2.7, played: 'long', moments: null, found: { nothing: 4, [rarity]: -3 } });
  assert.deepEqual(read, { ...emptyTally(), goldLooted: 2 });
  assert.deepEqual(readTally(OUTPOST_CONTENT, 'garbage'), emptyTally());
});

void test('every step adds its time, and every death of the hero and all looted gold are counted', (): void => {
  const world: World = createWorld(OUTPOST_CONTENT, { seed: 3, save: null });
  const monsterDeath: WorldEvent = { type: 'death', actorId: world.player.id + 1, team: 'monster', pos: { x: 0, z: 0 }, direction: { x: 1, z: 0 } };
  const heroDeath: WorldEvent = { type: 'death', actorId: world.player.id, team: 'player', pos: { x: 0, z: 0 }, direction: { x: 1, z: 0 } };
  world.events = [monsterDeath, heroDeath, { type: 'pickup', ground: gold(world, 37) }, { type: 'pickup', ground: gold(world, 5) }];
  stepTally(world, 0.5);
  stepTally(world, 0.25);
  assert.equal(world.player.tally.deaths, 2);
  assert.equal(world.player.tally.goldLooted, 84);
  assert.equal(world.player.tally.played, 0.75);
});

void test('killing a boss counts a kill and a boss, and the biggest hit is the largest the hero dealt', (): void => {
  const content: Content = room(bossId(OUTPOST_CONTENT));
  const world: World = sturdy(armed(worldIn(content, ROOM, 4)));
  const boss: MonsterState = onlyMonster(world);
  const events: WorldEvent[] = fightToDeath(world, boss);
  assert.equal(boss.alive, false);
  const dealt: number[] = events.flatMap((event: WorldEvent): number[] => (event.type === 'damage' && event.sourceId === world.player.id ? [event.amount] : []));
  assert.equal(world.player.tally.bosses, 1);
  assert.equal(world.player.kills, 1);
  assert.equal(world.player.tally.biggestHit, Math.max(...dealt));
  assert.ok(world.player.tally.played > 0);
});

void test('a monster that is not a boss counts a kill and no boss', (): void => {
  assert.equal(must(OUTPOST_CONTENT.monsters.get(PLAIN), PLAIN).boss, null);
  const content: Content = room(PLAIN);
  const world: World = sturdy(armed(worldIn(content, ROOM, 4)));
  fightToDeath(world, onlyMonster(world));
  assert.equal(world.player.kills, 1);
  assert.equal(world.player.tally.bosses, 0);
});

void test('an item rolled as loot is found under its rarity, and a starting item is not', (): void => {
  const world: World = createWorld(OUTPOST_CONTENT, { seed: 3, save: null });
  const rarity: string = must(OUTPOST_CONTENT.rarities[0], 'first rarity').id;
  const before: number = world.player.tally.found[rarity] ?? 0;
  world.events = [];
  const loot = must(makeItem(world, 2, null, rarity, { kind: 'monster', monster: 'mended', zone: world.zone.id }), 'loot');
  makeItem(world, 1, null, rarity, { kind: 'start', base: loot.base });
  assert.deepEqual(world.events.filter((event: WorldEvent): boolean => event.type === 'item_found'), [{ type: 'item_found', rarity }]);
  stepTally(world, 0);
  assert.equal(world.player.tally.found[rarity], before + 1);
});

void test('the stats name the furthest zone reached, the quests finished and every counter', (): void => {
  const world: World = createWorld(OUTPOST_CONTENT, { seed: 3, save: null });
  const quest: QuestDef = must([...OUTPOST_CONTENT.quests.values()][0], 'a quest');
  world.quests[quest.id] = quest.objectives.length;
  world.player.kills = 12;
  world.player.tally = { ...emptyTally(), bosses: 1, played: 60 };
  const save: SaveData = toSave(world);
  const stats: PlayerStats = playerStats(OUTPOST_CONTENT, save);
  assert.equal(stats.kills, 12);
  assert.equal(stats.bosses, 1);
  assert.equal(stats.played, 60);
  assert.equal(stats.quests, questsDone(OUTPOST_CONTENT, save.quests));
  assert.ok(stats.quests >= 1);
  assert.equal(stats.furthest, furthestZone(OUTPOST_CONTENT, save));
  const deepest: ZoneDef = must([...OUTPOST_CONTENT.zones.values()].reduce((best: ZoneDef | null, zone: ZoneDef): ZoneDef => (best === null || zone.level > best.level ? zone : best), null), 'zone');
  assert.equal(furthestZone(OUTPOST_CONTENT, { zone: save.zone, visited: [...save.visited, deepest.id] }), deepest.id);
});
