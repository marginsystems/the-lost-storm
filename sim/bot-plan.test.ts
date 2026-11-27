import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BotPlan } from './bot-plan.ts';
import { STAND_WEIGHTS, flaskCommands, junkIndex, nextPlace, planAttack, powerOf, releaseCommands, rollCommand, spinAim, upgradeIndex } from './bot-plan.ts';
import { generateItem } from './items.ts';
import { holdingParts } from './progression.ts';
import { loadContent } from './content/content.ts';
import type { Content, SkillDef, SkillTreeNodeDef } from './content/types.ts';
import { createWorld } from './world/create.ts';
import { spawnPackNear } from './world/monsters.ts';
import { resolveSkill } from './stats.ts';
import { stepWorld } from './world/step.ts';
import type { Command, ItemInstance, MonsterState, World } from './world/types.ts';

const content: Content = loadContent();

const PLAN: BotPlan = { name: 'test', flaskAt: 0.5, manaFlaskAt: null, rolls: true, loot: true, lineSeconds: 0, readSeconds: 0, paths: ['echo'], skills: ['forkline', 'storm_bolt'], route: [], weights: STAND_WEIGHTS, focus: null, style: 'stand', keepGap: 0, weapons: 'any', avoid: [] };

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

void test('a mixed build begins on its first path and walks across to the second, every place joined to what it holds', (): void => {
  const mixed: BotPlan = { ...PLAN, paths: ['storm', 'blade'] };
  const taken: string[] = [];
  for (let pick: number = 0; pick < 6; pick += 1) {
    const next: string | null = nextPlace(content, mixed, taken, 1);
    assert.ok(next !== null);
    taken.push(next);
  }
  assert.equal(pathOf(taken[0] ?? ''), 'storm');
  assert.ok(taken.some((id: string): boolean => pathOf(id) === 'blade'));
  assert.equal(holdingParts(content, taken).length, 1);
});

void test('a build begins at the ability place it prefers, then grows from it, and goes by path when it names none', (): void => {
  const both: BotPlan = { ...PLAN, paths: ['storm', 'stone'], skills: ['thunderclap', 'storm_bolt'] };
  assert.equal(nextPlace(content, both, [], 1), 'stone_thunderclap');
  assert.equal(nextPlace(content, both, ['stone_thunderclap'], 1), 'tempered_body');
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
  assert.equal(junkIndex(world, PLAN), 3);
  world.player.inventory[0] = null;
  assert.equal(junkIndex(world, PLAN), null);
  world.player.bar = ['cleave', 'dodge_roll', null, null, null, null];
  world.player.skills = world.player.bar.map((id: string | null) => (id === null ? null : (content.skills.get(id) ?? null)));
  assert.notEqual(rollCommand(world, { x: 0, z: 0 }), null);
  world.player.stagger = 0.5;
  assert.equal(rollCommand(world, { x: 0, z: 0 }), null);
});

void test('a route is walked place by place from the root, through the places between, and then the build fills by path', (): void => {
  const routed: BotPlan = { ...PLAN, paths: ['storm'], route: ['eye_of_the_storm'] };
  const taken: string[] = [];
  for (let pick: number = 0; pick < 40; pick += 1) {
    const next: string | null = nextPlace(content, routed, taken, 1);
    if (next === null) break;
    assert.ok(!taken.includes(next));
    taken.push(next);
    if (next === 'eye_of_the_storm') break;
  }
  assert.ok(taken.includes('eye_of_the_storm'));
  assert.equal(taken[0], 'storm_storm_bolt');
  assert.equal(holdingParts(content, taken).length, 1);
  assert.ok(taken.length < 25);
});

void test('a route that crosses a ring reaches the other path through the shared place', (): void => {
  const crossing: BotPlan = { ...PLAN, paths: [], route: ['storm_storm_bolt', 'stormcallers_focus', 'storm_1', 'storm_blade_near', 'blade_1', 'whetstone'] };
  const taken: string[] = [];
  for (let pick: number = 0; pick < 6; pick += 1) {
    const next: string | null = nextPlace(content, crossing, taken, 1);
    assert.notEqual(next, null);
    if (next !== null) taken.push(next);
  }
  assert.deepEqual(taken, crossing.route);
  assert.notEqual(nextPlace(content, crossing, taken, 1), null);
});

void test('gear is judged by the weights a build gives damage, toughness and speed', (): void => {
  const world: World = createWorld(content, { seed: 7, save: null });
  const plated: ItemInstance | null = generateItem(content, world.rng, 910, 9, 'traveller_coat', 'rare');
  assert.ok(plated !== null);
  world.player.inventory[0] = plated;
  const tough: BotPlan = { ...PLAN, weights: { dps: 0, toughness: 1, mobility: 0 } };
  const idle: BotPlan = { ...PLAN, weights: { dps: 0, toughness: 0, mobility: 0 } };
  assert.equal(upgradeIndex(world, idle), null);
  assert.ok([0, null].includes(upgradeIndex(world, tough)));
});

void test('a build that keeps its distance does not blink onto its target, and one that stands does', (): void => {
  const world: World = createWorld(content, { seed: 9, save: null });
  const mist: SkillDef | undefined = content.skills.get('mist_step');
  assert.ok(mist !== undefined);
  world.player.skills = [content.skills.get('cleave') ?? null, mist, null, null, null, null];
  world.player.mana = 200;
  const target = world.monsters[0];
  assert.ok(target !== undefined);
  target.pos = { x: world.player.pos.x + 7, z: world.player.pos.z };
  const stands: Command[] = planAttack(world, { ...PLAN, skills: ['mist_step'] }, target, [target]);
  const kites: Command[] = planAttack(world, { ...PLAN, skills: ['mist_step'], style: 'kite', keepGap: 4 }, target, [target]);
  assert.equal(stands.some((command: Command): boolean => command.type === 'skill' && command.slot === 1), true);
  assert.equal(kites.some((command: Command): boolean => command.type === 'skill' && command.slot === 1), false);
});

void test('a skill a build avoids is never cast even when it is ready and in reach', (): void => {
  const world: World = createWorld(content, { seed: 9, save: null });
  const bolt: SkillDef | undefined = content.skills.get('storm_bolt');
  assert.ok(bolt !== undefined);
  world.player.skills = [content.skills.get('cleave') ?? null, bolt, null, null, null, null];
  world.player.mana = 200;
  const target = world.monsters[0];
  assert.ok(target !== undefined);
  target.pos = { x: world.player.pos.x + 5, z: world.player.pos.z };
  const casts = (plan: BotPlan): boolean => planAttack(world, plan, target, [target]).some((command: Command): boolean => command.type === 'skill' && command.slot === 1);
  assert.equal(casts({ ...PLAN, skills: ['storm_bolt'] }), true);
  assert.equal(casts({ ...PLAN, skills: ['storm_bolt'], avoid: ['storm_bolt'] }), false);
});

void test('with no path named, a build that has spent its route keeps spending on the paths it holds', (): void => {
  const routed: BotPlan = { ...PLAN, paths: [], route: ['storm_storm_bolt'] };
  const taken: string[] = ['storm_storm_bolt'];
  for (let pick: number = 0; pick < 6; pick += 1) {
    const next: string | null = nextPlace(content, routed, taken, 1);
    assert.notEqual(next, null);
    if (next !== null) taken.push(next);
  }
  assert.ok(taken.every((id: string): boolean => pathOf(id) === 'storm'));
});

void test('a build fills its spare points by path without taking a keystone its route does not name', (): void => {
  const filler: BotPlan = { ...PLAN, paths: ['blade'], route: [] };
  const taken: string[] = [];
  for (let pick: number = 0; pick < content.skillTree.length; pick += 1) {
    const next: string | null = nextPlace(content, filler, taken, 1);
    if (next === null) break;
    taken.push(next);
  }
  assert.ok(taken.length > 15);
  assert.ok(!taken.includes('edge_without_rest'));
  const named: BotPlan = { ...filler, route: ['edge_without_rest'] };
  const walked: string[] = [];
  for (let pick: number = 0; pick < content.skillTree.length; pick += 1) {
    const next: string | null = nextPlace(content, named, walked, 1);
    if (next === null) break;
    walked.push(next);
  }
  assert.ok(walked.includes('edge_without_rest'));
});

void test('a spinning hero keeps holding and steers into the thickest crowd, and lets go once nothing is left in sight', (): void => {
  const world: World = createWorld(content, { seed: 9, save: null });
  const cleave: SkillDef | undefined = content.skills.get('cleave');
  assert.ok(cleave !== undefined);
  const spin: SkillDef = resolveSkill(content, cleave, ['whirling_cleave', 'endless_turn']);
  assert.ok(spin.momentum !== null);
  world.player.skills = [spin, null, null, null, null, null];
  world.player.mana = 200;
  world.monsters = [];
  const at = world.player.pos;
  const lone: MonsterState[] = spawnPackNear(world, 'unfinished_taker', 1, { x: at.x + 3, z: at.z });
  const crowd: MonsterState[] = spawnPackNear(world, 'unfinished_taker', 5, { x: at.x, z: at.z + 7 });
  assert.equal(lone.length + crowd.length, 6);
  const aim = spinAim(world, spin);
  assert.ok(aim !== null && aim.z > at.z + 4, JSON.stringify(aim));
  const target = lone[0];
  assert.ok(target !== undefined);
  const press: Command[] = planAttack(world, PLAN, target, [...lone, ...crowd]);
  assert.deepEqual(press[0], { type: 'hold', slot: 0, down: true });
  stepWorld(world, press, 1 / 60);
  assert.equal(world.player.action?.phase !== undefined, true);
  const held: Command[] = releaseCommands(world);
  assert.equal(held.length, 1);
  assert.equal(held[0]?.type, 'steer');
  for (const monster of [...lone, ...crowd]) monster.alive = false;
  assert.equal(spinAim(world, spin), null);
  assert.deepEqual(releaseCommands(world), [{ type: 'hold', slot: 0, down: false }]);
});

void test('a spinning hero lets go to throw Millrace once the momentum is high and the wave is ready, and never throws it empty', (): void => {
  const world: World = createWorld(content, { seed: 9, save: null });
  const cleave: SkillDef | undefined = content.skills.get('cleave');
  const race: SkillDef | undefined = content.skills.get('millrace');
  assert.ok(cleave !== undefined && race !== undefined);
  const spin: SkillDef = resolveSkill(content, cleave, ['whirling_cleave', 'endless_turn']);
  const cap: number = spin.momentum?.cap ?? 0;
  world.player.skills = [spin, race, null, null, null, null];
  world.player.mana = 200;
  world.monsters = [];
  const at = world.player.pos;
  const crowd: MonsterState[] = spawnPackNear(world, 'unfinished_taker', 4, { x: at.x + 3, z: at.z });
  const target = crowd[0];
  assert.ok(target !== undefined);
  const opening: Command[] = planAttack(world, PLAN, target, crowd);
  assert.deepEqual(opening[0], { type: 'hold', slot: 0, down: true });
  stepWorld(world, opening, 1 / 60);
  world.player.skills = [spin, race, null, null, null, null];
  world.player.momentum = { skill: spin.id, value: cap * 0.3, quiet: 0 };
  assert.equal(releaseCommands(world)[0]?.type, 'steer');
  world.player.momentum = { skill: spin.id, value: cap * 0.8, quiet: 0 };
  assert.deepEqual(releaseCommands(world), [{ type: 'hold', slot: 0, down: false }]);
  world.player.cooldowns[race.id] = 2;
  assert.equal(releaseCommands(world)[0]?.type, 'steer');
  world.player.action = null;
  world.player.cooldowns[race.id] = 0;
  const thrown: Command[] = planAttack(world, PLAN, target, crowd);
  assert.equal(thrown.some((command: Command): boolean => command.type === 'skill' && command.slot === 1), true);
  world.player.momentum = { skill: spin.id, value: 0, quiet: 0 };
  const empty: Command[] = planAttack(world, PLAN, target, crowd);
  assert.equal(empty.some((command: Command): boolean => command.type === 'skill' && command.slot === 1), false);
});

void test('a bot closes a gap in flight, follows the moving foe and lands at its preferred range', (): void => {
  const world = createWorld(content, { seed: 9, save: null });
  const hero = world.player;
  const swift = content.skills.get('ember_swift');
  assert.ok(swift !== undefined);
  hero.skills = [null, swift];
  const target = spawnPackNear(world, 'unfinished_taker', 1, hero.pos)[0];
  assert.ok(target !== undefined);
  target.pos = { x: hero.pos.x + 12, z: hero.pos.z };
  const start = planAttack(world, PLAN, target, [target]);
  assert.deepEqual(start[0], { type: 'hold', slot: 1, down: true });
  stepWorld(world, start, 1 / 60);
  target.pos = { x: hero.pos.x, z: hero.pos.z + 9 };
  assert.deepEqual(releaseCommands(world, target.id, 3), [{ type: 'steer', aim: target.pos }]);
  target.pos.z = hero.pos.z + 3;
  assert.deepEqual(releaseCommands(world, target.id, 3), [{ type: 'hold', slot: 1, down: false }]);
});
