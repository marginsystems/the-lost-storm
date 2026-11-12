import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BotPlan } from './bot-plan.ts';
import { flaskCommands, junkIndex, nextPlace, powerOf, releaseCommands, rollCommand } from './bot-plan.ts';
import { generateItem } from './items.ts';
import { loadContent } from './content/content.ts';
import type { Content, SkillTreeNodeDef } from './content/types.ts';
import { createWorld } from './world/create.ts';
import type { Command, ItemInstance, World } from './world/types.ts';

const content: Content = loadContent();

const PLAN: BotPlan = { name: 'test', flaskAt: 0.5, manaFlaskAt: null, rolls: true, loot: true, lineSeconds: 0, readSeconds: 0, paths: ['echo'], skills: ['forkline', 'storm_bolt'] };

function pathOf(id: string): string {
  return content.skillTree.find((node: SkillTreeNodeDef): boolean => node.id === id)?.path ?? 'none';
}

void test('a build spends every point on its own path, nearest the root first', (): void => {
  const allocated: string[] = [];
  for (let point: number = 0; point < 6; point += 1) {
    const place: string | null = nextPlace(content, PLAN, allocated, 1);
    assert.notEqual(place, null);
    if (place !== null) allocated.push(place);
  }
  assert.ok(allocated.every((id: string): boolean => pathOf(id) === 'echo'), allocated.join(', '));
  assert.equal(content.skillTree.find((node: SkillTreeNodeDef): boolean => node.id === allocated[0])?.requires.length, 0);
  assert.equal(nextPlace(content, PLAN, allocated, 0), null);
});

void test('a mixed build takes turns between its paths', (): void => {
  const mixed: BotPlan = { ...PLAN, paths: ['storm', 'blade'] };
  const first: string | null = nextPlace(content, mixed, [], 2);
  const second: string | null = first === null ? null : nextPlace(content, mixed, [first], 1);
  assert.deepEqual([first, second].map((id: string | null): string => pathOf(id ?? '')), ['storm', 'blade']);
});

void test('a build takes the ability place it prefers before other places, and goes by path when it names none', (): void => {
  const both: BotPlan = { ...PLAN, paths: ['storm', 'stone'], skills: ['thunderclap', 'storm_bolt'] };
  assert.equal(nextPlace(content, both, [], 1), 'stone_thunderclap');
  assert.equal(nextPlace(content, both, ['stone_thunderclap'], 1), 'storm_storm_bolt');
  assert.equal(pathOf(nextPlace(content, { ...both, skills: [] }, [], 1) ?? ''), 'storm');
});

void test('the bot drinks below its threshold and only then', (): void => {
  const world: World = createWorld(content, { seed: 4, save: null });
  assert.deepEqual(flaskCommands(world, PLAN), []);
  world.player.life = world.player.maxLife * 0.4;
  const drink: Command[] = flaskCommands(world, PLAN);
  assert.equal(drink.length, 1);
  assert.deepEqual(flaskCommands(world, { ...PLAN, flaskAt: null }), []);
  assert.deepEqual(releaseCommands(world), []);
});

void test('power rises with level and counts the equipped item levels', (): void => {
  const world: World = createWorld(content, { seed: 4, save: null });
  const low = powerOf(content, 1, world.player.equipped, []);
  const high = powerOf(content, 8, world.player.equipped, []);
  assert.ok(high.dps > low.dps && high.toughness > low.toughness);
  assert.equal(low.itemLevels, Object.values(world.player.equipped).reduce((sum: number, item): number => sum + (item?.level ?? 0), 0));
});

void test('a full bag drops its weakest item, and a staggered hero does not try to roll', (): void => {
  const world: World = createWorld(content, { seed: 6, save: null });
  const weak: ItemInstance | null = generateItem(content, world.rng, 900, 1, 'rusted_blade', 'common');
  const strong: ItemInstance | null = generateItem(content, world.rng, 901, 9, 'tempest_greatsword', 'stormtouched');
  assert.ok(weak !== null && strong !== null);
  world.player.inventory = world.player.inventory.map((_item: ItemInstance | null, index: number): ItemInstance => (index === 3 ? weak : { ...strong, uid: 1000 + index }));
  assert.equal(junkIndex(world), 3);
  world.player.inventory[0] = null;
  assert.equal(junkIndex(world), null);
  world.player.bar = ['cleave', 'dodge_roll', null, null, null, null];
  world.player.skills = world.player.bar.map((id: string | null) => (id === null ? null : (content.skills.get(id) ?? null)));
  assert.notEqual(rollCommand(world, { x: 0, z: 0 }), null);
  world.player.stagger = 0.5;
  assert.equal(rollCommand(world, { x: 0, z: 0 }), null);
});
