import assert from 'node:assert/strict';
import { test } from 'node:test';
import { armed, must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, SkillDef, XpReduction } from '../content/types.ts';
import { revealed, veiled } from '../identify.ts';
import { generateItem } from '../items.ts';
import { xpToNextLevel } from '../progression.ts';
import { createRng } from '../rng.ts';
import { refundCost } from '../progression.ts';
import { bountyReduction, grantXp, heldLook, killReduction, killXp, refreshPlayer } from './character.ts';
import { stepWorld } from './step.ts';
import type { Command, ItemInstance, World, WorldEvent } from './types.ts';

const content: Content = loadContent();

function chartWorld(): World {
  const world: World = armed(worldIn(content, 'hall_of_time', 1));
  world.player.skillPoints = 5;
  for (const node of ['stone_thunderclap', 'tempered_body', 'stone_1', 'bedrock']) stepWorld(world, [{ type: 'allocate', node }], 1 / 60);
  return world;
}

function send(world: World, command: Command): WorldEvent[] {
  return stepWorld(world, [command], 1 / 60);
}

void test('every level brings the points the chart asks for', (): void => {
  const world: World = armed(worldIn(content, 'hall_of_time', 1));
  const before: number = world.player.skillPoints;
  grantXp(world, xpToNextLevel(content.player.xp, world.player.level));
  assert.equal(world.player.skillPoints - before, content.chart.pointsPerLevel);
  assert.ok(content.chart.pointsPerLevel >= 2);
});

void test('a place at the edge of what was taken is given back for gold and its point returns', (): void => {
  const world: World = chartWorld();
  assert.deepEqual(world.player.allocated, ['stone_thunderclap', 'tempered_body', 'stone_1', 'bedrock']);
  const life: number = world.player.stats.maxLife;
  world.player.gold = 1000;
  send(world, { type: 'refund', node: 'stone_1' });
  assert.equal(world.player.allocated.length, 4);
  send(world, { type: 'refund', node: 'bedrock' });
  assert.deepEqual(world.player.allocated, ['stone_thunderclap', 'tempered_body', 'stone_1']);
  assert.equal(world.player.skillPoints, 2);
  assert.equal(world.player.gold, 1000 - refundCost(content, world.player.level, 1));
  assert.ok(world.player.stats.maxLife < life);
});

void test('a full respec returns every point and costs gold for each, and without the gold nothing changes', (): void => {
  const world: World = chartWorld();
  world.player.freeReset = false;
  world.player.gold = 0;
  const refused: WorldEvent[] = send(world, { type: 'respec' });
  assert.ok(refused.some((event: WorldEvent): boolean => event.type === 'notice' && event.reason === 'no_gold'));
  assert.equal(world.player.allocated.length, 4);
  world.player.gold = refundCost(content, world.player.level, 4);
  send(world, { type: 'respec' });
  assert.deepEqual(world.player.allocated, []);
  assert.equal(world.player.skillPoints, 5);
  assert.equal(world.player.gold, 0);
});

void test('a banked free start over returns every point for no gold once, and the next one costs gold again', (): void => {
  const world: World = chartWorld();
  assert.equal(world.player.freeReset, true);
  world.player.gold = 0;
  send(world, { type: 'respec' });
  assert.deepEqual(world.player.allocated, []);
  assert.equal(world.player.skillPoints, 5);
  assert.equal(world.player.gold, 0);
  assert.equal(world.player.freeReset, false);
  for (const node of ['stone_thunderclap', 'tempered_body']) send(world, { type: 'allocate', node });
  const refused: WorldEvent[] = send(world, { type: 'respec' });
  assert.ok(refused.some((event: WorldEvent): boolean => event.type === 'notice' && event.reason === 'no_gold'));
  assert.equal(world.player.allocated.length, 2);
});

void test('a fourth Legendary stays in the bag with a notice, and the three worn stay on', (): void => {
  const world: World = armed(worldIn(content, 'hall_of_time', 1));
  const roll = (base: string): ItemInstance => {
    const made: ItemInstance | null = generateItem(content, createRng(world.nextItemUid), world.nextItemUid, 5, base, null);
    world.nextItemUid += 1;
    if (made === null) throw new Error(base);
    return made;
  };
  world.player.inventory = world.player.inventory.map((): null => null);
  ['wirethread_gloves', 'lantern_of_second_sounds', 'crown_of_the_struck_hour', 'the_millwheel'].forEach((base: string, index: number): void => {
    world.player.inventory[index] = roll(base);
  });
  for (const index of [0, 1, 2]) send(world, { type: 'equip', inventoryIndex: index });
  const events: WorldEvent[] = send(world, { type: 'equip', inventoryIndex: 3 });
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'notice' && event.reason === 'legendary_limit'));
  assert.equal(world.player.inventory[3]?.base, 'the_millwheel');
  assert.deepEqual([world.player.equipped.hands?.base, world.player.equipped.charm?.base, world.player.equipped.head?.base], ['wirethread_gloves', 'lantern_of_second_sounds', 'crown_of_the_struck_hour']);
});

void test('a dropped item lies at the hero feet and a pickup puts it back in the bag', (): void => {
  const world: World = armed(worldIn(content, 'hideout', 1));
  world.monsters = [];
  const blade: ItemInstance = { uid: 4100, base: 'rusted_blade', rarity: 'common', level: 1, affixes: [], ledger: null };
  world.player.inventory.fill(null);
  world.player.inventory[0] = blade;
  send(world, { type: 'drop', inventoryIndex: 0 });
  assert.equal(world.player.inventory[0], null);
  const ground = world.ground.find((entry): boolean => entry.content.kind === 'item' && entry.content.item.uid === blade.uid);
  assert.ok(ground !== undefined);
  for (let tick: number = 0; tick < 240 && !world.player.inventory.some((item): boolean => item?.uid === blade.uid); tick += 1) send(world, { type: 'pickup', groundId: ground.id });
  assert.ok(world.player.inventory.some((item): boolean => item?.uid === blade.uid));
});

void test('a story item never leaves the bag by a drop', (): void => {
  const world: World = armed(worldIn(content, 'hideout', 1));
  const journal: ItemInstance = { uid: 4200, base: 'worn_journal', rarity: 'common', level: 1, affixes: [], ledger: null };
  world.player.inventory.fill(null);
  world.player.inventory[2] = journal;
  send(world, { type: 'drop', inventoryIndex: 2 });
  assert.equal(world.player.inventory[2], journal);
  assert.ok(!world.ground.some((entry): boolean => entry.content.kind === 'item' && entry.content.item.uid === journal.uid));
});

void test('a kill pays its xp scaled up by the foe level, in full near the hero and much less far from him either way', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 1);
  world.player.level = 10;
  const even: number = killXp(world, 20, 10);
  assert.equal(even, Math.round(20 * (1 + content.world.scaling.xpPerLevel * 9)));
  assert.equal(killXp(world, 20, 6), Math.round(20 * (1 + content.world.scaling.xpPerLevel * 5)));
  assert.equal(killReduction(world, 6), null);
  assert.equal(killReduction(world, 14), null);
  const below: XpReduction = must(killReduction(world, 1), 'a reduction far below');
  assert.equal(below.side, 'below');
  assert.ok(below.share < 1 && below.share > 0);
  assert.equal(killReduction(world, 25)?.side, 'above');
  world.player.level = 20;
  const far: number = killXp(world, 20, 5);
  assert.ok(far > 0 && far < killXp(world, 20, 18));
});

void test('a kill far below the hero at the floor still pays at least one point of experience', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 1);
  world.player.level = 30;
  assert.equal(killXp(world, 8, 1), 1);
  assert.equal(killXp(world, 0, 1), 0);
});

void test('a bounty earned from echoes on both sides of the band is labelled by its whole share', (): void => {
  const low: XpReduction = { side: 'below', share: 0.1 };
  assert.equal(bountyReduction(100, 100, low), null);
  assert.equal(bountyReduction(100, 100, null), null);
  assert.deepEqual(bountyReduction(55, 100, low), { side: 'below', share: 0.55 });
});

void test('an xp gain says whether it was reduced and on which side', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 1);
  world.player.level = 9;
  world.events = [];
  grantXp(world, 5, killReduction(world, 1));
  grantXp(world, 5, killReduction(world, 8));
  const gains: (XpReduction | null)[] = world.events.flatMap((event: WorldEvent): (XpReduction | null)[] => (event.type === 'xp' ? [event.reduced] : []));
  assert.equal(gains[0]?.side, 'below');
  assert.equal(gains[1], null);
});

const BOTH_CHANGES: readonly string[] = ['storm_storm_bolt', 'stormcallers_focus', 'storm_1', 'forked_bolt', 'storm_4', 'storm_lance', 'echo_storm_mid', 'twice_told_bolt'];

function boltName(world: World): string {
  return must(world.player.skills.find((skill: SkillDef | null): boolean => skill?.id === 'storm_bolt'), 'storm bolt on the bar').name;
}

void test('the player picks which held change of a skill is active, only among changes a held place gives, and a refunded choice falls back', (): void => {
  const world: World = armed(worldIn(content, 'hall_of_time', 1));
  world.player.equipped.weapon = must(generateItem(content, createRng(1), 1, 1, 'stormcaller_stave', 'common'), 'stave');
  refreshPlayer(world);
  world.player.skillPoints = BOTH_CHANGES.length;
  for (const node of BOTH_CHANGES) send(world, { type: 'allocate', node });
  assert.deepEqual(world.player.allocated, BOTH_CHANGES);
  send(world, { type: 'slot', slot: 0, skill: 'storm_bolt' });
  const lance: string = must(content.skills.get('storm_bolt_lance'), 'lance').name;
  const echo: string = must(content.skills.get('storm_bolt_echo'), 'echo').name;
  assert.equal(boltName(world), lance);
  send(world, { type: 'choose_change', skill: 'storm_bolt', becomes: 'storm_bolt_echo' });
  assert.deepEqual(world.player.changes, { storm_bolt: 'storm_bolt_echo' });
  assert.equal(boltName(world), echo);
  send(world, { type: 'choose_change', skill: 'storm_bolt', becomes: 'cleave_whirl' });
  send(world, { type: 'choose_change', skill: 'cleave', becomes: 'cleave_whirl' });
  assert.deepEqual(world.player.changes, { storm_bolt: 'storm_bolt_echo' });
  world.player.gold = 1000;
  send(world, { type: 'refund', node: 'twice_told_bolt' });
  assert.deepEqual(world.player.changes, {});
  assert.equal(boltName(world), lance);
});

void test('a held change with a look reaches the bar skill it changes, even where a weapon turns that skill into another', (): void => {
  const world: World = armed(worldIn(content, 'hall_of_time', 1));
  const bow: ItemInstance = must(generateItem(content, createRng(3), 900001, 10, 'hand_crossbow', 'common'), 'crossbow');
  world.player.equipped.weapon = bow;
  refreshPlayer(world);
  assert.equal(heldLook(world, 'cleave'), null);
  world.player.powers.empowers.push({ key: 'veil', skillMods: [{ target: { type: 'skill', skill: 'quarrel' }, field: 'pierce', value: 1 }], look: { color: '#5a2fc0', shade: 0.22 }, timeLeft: 2 });
  assert.deepEqual(heldLook(world, 'cleave'), { color: '#5a2fc0', shade: 0.22 });
  world.player.equipped.weapon = null;
  refreshPlayer(world);
  assert.equal(heldLook(world, 'cleave'), null);
});

void test('an unidentified item cannot be worn until it is identified', (): void => {
  const world: World = armed(worldIn(content, 'hall_of_time', 1));
  const rolled: ItemInstance = must(generateItem(content, createRng(77), 900, 4, 'gale_charm', 'rare'), 'charm');
  world.player.inventory[0] = veiled(content, rolled);
  const worn: ItemInstance | null = world.player.equipped.charm;
  const events: WorldEvent[] = send(world, { type: 'equip', inventoryIndex: 0 });
  assert.equal(world.player.equipped.charm, worn);
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'notice' && event.reason === 'unidentified'));
  world.player.inventory[0] = revealed(must(world.player.inventory[0], 'held'));
  send(world, { type: 'equip', inventoryIndex: 0 });
  assert.deepEqual(world.player.equipped.charm, rolled);
});
