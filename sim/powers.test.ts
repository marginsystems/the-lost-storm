import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, ARENA_CONTENT, arena, place } from '../test/arena-support.ts';
import { must, worldIn } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Content, MonsterDef, SkillDef, SkillTreeNodeDef } from './content/types.ts';
import { generateItem, slotOf } from './items.ts';
import { buffMods, emptyPowerState, familyReading, firePowers, heldPowers, stepPowerState, wornPowers, wouldPassLimit } from './powers.ts';
import { resolveSkill } from './stats.ts';
import { createRng } from './rng.ts';
import { applyHit, offenceOf } from './world/combat.ts';
import { refreshPlayer } from './world/character.ts';
import { stepWorld } from './world/step.ts';
import { distance } from './math.ts';
import type { EchoState, ItemInstance, MonsterState, PowerState, World } from './world/types.ts';

const shambler: MonsterDef = must(ARENA_CONTENT.monsters.get('test_shambler'), 'shambler');
const content: Content = {
  ...ARENA_CONTENT,
  monsters: new Map<string, MonsterDef>([...ARENA_CONTENT.monsters, ['test_echo', { ...shambler, id: 'test_echo', faction: ARENA_CONTENT.moments.faction }], ['test_post', { ...shambler, id: 'test_post', moveSpeed: 0 }]]),
};
const skill = (id: string): SkillDef => must(content.skills.get(id), id);

function item(base: string, uid: number): ItemInstance {
  return must(generateItem(content, createRng(uid), uid, 5, base, null), base);
}

function wear(world: World, base: string): ItemInstance {
  const made: ItemInstance = item(base, world.nextItemUid);
  world.nextItemUid += 1;
  world.player.equipped[must(slotOf(content, made), base)] = made;
  return made;
}

function hero(): World {
  return arena(1, content);
}

function casts(world: World): string[] {
  return world.echoes.map((echo: EchoState): string => echo.skill.id);
}

void test('a forced base with a power is always Legendary', (): void => {
  assert.equal(item('the_millwheel', 1).rarity, 'stormtouched');
  assert.equal(must(generateItem(content, createRng(2), 2, 5, 'wirethread_gloves', 'common'), 'gloves').rarity, 'stormtouched');
});

void test('worn powers come from equipped items only', (): void => {
  const world: World = hero();
  assert.deepEqual(wornPowers(content, world.player.equipped), []);
  wear(world, 'lantern_of_second_sounds');
  assert.deepEqual(
    wornPowers(content, world.player.equipped).map((power): string => power.family),
    ['forkweather'],
  );
});

void test('a fourth Legendary would pass the limit, but swapping one in its own slot would not', (): void => {
  const world: World = hero();
  wear(world, 'wirethread_gloves');
  wear(world, 'lantern_of_second_sounds');
  wear(world, 'crown_of_the_struck_hour');
  assert.ok(wouldPassLimit(content, world.player.equipped, item('the_millwheel', 90)));
  assert.ok(!wouldPassLimit(content, world.player.equipped, item('grinders_bracers', 91)));
  assert.ok(!wouldPassLimit(content, world.player.equipped, must(generateItem(content, createRng(3), 92, 5, 'stormsteel_sword', 'rare'), 'sword')));
});

void test('an echo killed while wearing the Wirethread Gloves releases a Forkline where it stood; another kill does not', (): void => {
  const world: World = hero();
  wear(world, 'wirethread_gloves');
  const echo: MonsterState = place(world, 'test_echo', { x: ARENA_CENTRE.x + 2, z: ARENA_CENTRE.z });
  firePowers(world, { on: 'kill', skill: skill('cleave'), target: echo, at: echo.pos });
  assert.deepEqual(casts(world), ['forkline']);
  assert.deepEqual(must(world.echoes[0], 'cast').origin, { x: echo.pos.x, z: echo.pos.z });
  const plain: MonsterState = place(world, 'test_shambler', { x: ARENA_CENTRE.x - 2, z: ARENA_CENTRE.z });
  firePowers(world, { on: 'kill', skill: skill('cleave'), target: plain, at: plain.pos });
  assert.equal(world.echoes.length, 1);
});

void test('powers follow the gear worn at the moment of the kill, even when it changes between two kills', (): void => {
  const world: World = hero();
  const first: MonsterState = place(world, 'test_echo', { x: ARENA_CENTRE.x + 2, z: ARENA_CENTRE.z });
  firePowers(world, { on: 'kill', skill: skill('cleave'), target: first, at: first.pos });
  assert.deepEqual(casts(world), []);
  const gloves: ItemInstance = wear(world, 'wirethread_gloves');
  const second: MonsterState = place(world, 'test_echo', { x: ARENA_CENTRE.x - 2, z: ARENA_CENTRE.z });
  firePowers(world, { on: 'kill', skill: skill('cleave'), target: second, at: second.pos });
  assert.deepEqual(casts(world), ['forkline']);
  world.player.equipped[must(slotOf(content, gloves), 'gloves')] = null;
  world.player.powers.cooldowns = {};
  firePowers(world, { on: 'kill', skill: skill('cleave'), target: second, at: second.pos });
  assert.deepEqual(casts(world), ['forkline']);
});

void test('a killing blow on an echo goes through combat to the gloves', (): void => {
  const world: World = hero();
  wear(world, 'wirethread_gloves');
  const echo: MonsterState = place(world, 'test_echo', { x: ARENA_CENTRE.x + 2, z: ARENA_CENTRE.z });
  echo.life = 1;
  applyHit(world, offenceOf(world.player), echo, skill('cleave'), { x: 1, z: 0 });
  assert.equal(echo.alive, false);
  assert.deepEqual(casts(world), ['forkline']);
});

void test('the Crown splits a Storm Bolt once per bolt: its cooldown holds the second hit back', (): void => {
  const world: World = hero();
  wear(world, 'crown_of_the_struck_hour');
  const target: MonsterState = place(world, 'test_shambler', { x: ARENA_CENTRE.x + 3, z: ARENA_CENTRE.z });
  const bolt: SkillDef = skill('storm_bolt');
  firePowers(world, { on: 'hit', skill: bolt, target, at: target.pos });
  firePowers(world, { on: 'hit', skill: bolt, target, at: target.pos });
  assert.deepEqual(casts(world), ['forkline']);
  firePowers(world, { on: 'hit', skill: skill('forkline'), target, at: target.pos });
  assert.equal(world.echoes.length, 1);
  stepPowerState(world.player.powers, 0.5);
  firePowers(world, { on: 'hit', skill: bolt, target, at: target.pos });
  assert.deepEqual(casts(world), ['forkline', 'forkline']);
});

void test('Grinder\'s Bracers stack attack speed per Cleave hit up to ten, then the buff runs out', (): void => {
  const world: World = hero();
  wear(world, 'grinders_bracers');
  const target: MonsterState = place(world, 'test_shambler', { x: ARENA_CENTRE.x + 1, z: ARENA_CENTRE.z });
  for (let hit: number = 0; hit < 12; hit += 1) assert.ok(firePowers(world, { on: 'hit', skill: skill('cleave'), target, at: target.pos }));
  assert.ok(!firePowers(world, { on: 'hit', skill: skill('storm_bolt'), target, at: target.pos }));
  const mods = buffMods(world.player.powers);
  assert.equal(mods.length, 1);
  assert.equal(must(mods[0], 'buff').stat, 'attackSpeed');
  assert.ok(Math.abs(must(mods[0], 'buff').value - 0.4) < 1e-9);
  assert.equal(stepPowerState(world.player.powers, 2.9), false);
  assert.equal(stepPowerState(world.player.powers, 0.2), true);
  assert.deepEqual(buffMods(world.player.powers), []);
});

void test('the Gyre-Stitched Breeches let out a Thunderclap on every third turn of a held Cleave', (): void => {
  const world: World = hero();
  wear(world, 'gyre_stitched_breeches');
  const turn = (): boolean => firePowers(world, { on: 'pulse', skill: skill('cleave'), target: null, at: world.player.pos });
  for (let count: number = 0; count < 7; count += 1) turn();
  assert.deepEqual(casts(world), ['thunderclap', 'thunderclap']);
  assert.deepEqual(must(world.echoes[0], 'clap').origin, { x: world.player.pos.x, z: world.player.pos.z });
});

void test('cooldowns run out and are removed', (): void => {
  const state: PowerState = emptyPowerState();
  state.cooldowns['crown:0'] = 0.3;
  stepPowerState(state, 0.2);
  assert.ok((state.cooldowns['crown:0'] ?? 0) > 0);
  stepPowerState(state, 0.2);
  assert.deepEqual(state.cooldowns, {});
});

void test('a Legendary reads its power and its family, counting the pieces worn with it', (): void => {
  const world: World = hero();
  const crown: ItemInstance = item('crown_of_the_struck_hour', 40);
  const alone = must(familyReading(content, crown, world.player.equipped), 'reading');
  assert.equal(alone.name, 'Forkweather');
  assert.equal(alone.text, 'Storm Bolt splits into a Forkline on its first hit.');
  assert.equal(alone.count, 1);
  assert.deepEqual(alone.pieces.map((piece): string => `${piece.name}${piece.worn ? '*' : ''}`), ['Wirethread Gloves', 'Lantern of Second Sounds', 'Crown of the Struck Hour*']);
  wear(world, 'wirethread_gloves');
  wear(world, 'the_millwheel');
  assert.equal(familyReading(content, crown, world.player.equipped)?.count, 2);
  assert.equal(familyReading(content, item('stormsteel_sword', 41), world.player.equipped), null);
});

void test('Quietshot: a Dodge Roll gives +60% damage for three seconds, and no other skill does', (): void => {
  const world: World = hero();
  wear(world, 'quietshot');
  assert.ok(!firePowers(world, { on: 'use', skill: skill('cleave'), target: null, at: world.player.pos }));
  assert.ok(firePowers(world, { on: 'use', skill: skill('dodge_roll'), target: null, at: world.player.pos }));
  assert.ok(firePowers(world, { on: 'use', skill: skill('dodge_roll'), target: null, at: world.player.pos }));
  const mods = buffMods(world.player.powers);
  assert.equal(mods.length, 1);
  assert.equal(must(mods[0], 'buff').stat, 'damagePercent');
  assert.ok(Math.abs(must(mods[0], 'buff').value - 0.6) < 1e-9);
  stepPowerState(world.player.powers, 3.1);
  assert.deepEqual(buffMods(world.player.powers), []);
});

void test('Groundbreaker: every third Cleave strike lets out a Thunderclap on the enemy struck, and each strike stacks armour up to ten', (): void => {
  const world: World = hero();
  wear(world, 'groundbreaker');
  const target: MonsterState = place(world, 'test_shambler', { x: ARENA_CENTRE.x + 1, z: ARENA_CENTRE.z });
  for (let hit: number = 0; hit < 3; hit += 1) firePowers(world, { on: 'hit', skill: skill('cleave'), target, at: target.pos });
  assert.deepEqual(casts(world), ['thunderclap']);
  assert.deepEqual(must(world.echoes[0], 'clap').origin, { x: target.pos.x, z: target.pos.z });
  for (let hit: number = 0; hit < 12; hit += 1) firePowers(world, { on: 'hit', skill: skill('cleave'), target, at: target.pos });
  assert.ok(Math.abs(must(buffMods(world.player.powers)[0], 'armour').value - 50) < 1e-9);
  firePowers(world, { on: 'hit', skill: skill('storm_bolt'), target, at: target.pos });
  assert.ok(world.echoes.length <= 6);
});

void test('Rainmaker: a Squall also breaks over the caster, and lasts longer', (): void => {
  const world: World = hero();
  wear(world, 'rainmaker');
  const away = { x: world.player.pos.x + 6, z: world.player.pos.z };
  firePowers(world, { on: 'use', skill: skill('squall'), target: null, at: away });
  assert.deepEqual(casts(world), ['squall']);
  assert.deepEqual(must(world.echoes[0], 'squall').origin, { x: world.player.pos.x, z: world.player.pos.z });
  firePowers(world, { on: 'use', skill: skill('storm_bolt'), target: null, at: away });
  assert.equal(world.echoes.length, 1);
});

void test('an item power does not cast a skill that needs another weapon than the one in hand', (): void => {
  const skills: Map<string, SkillDef> = new Map<string, SkillDef>(content.skills);
  skills.set('forkline', { ...skill('forkline'), weapons: ['staff'] });
  const world: World = arena(1, { ...content, skills });
  wear(world, 'wirethread_gloves');
  world.player.wielding = 'blade';
  const echo: MonsterState = place(world, 'test_echo', { x: ARENA_CENTRE.x + 2, z: ARENA_CENTRE.z });
  firePowers(world, { on: 'kill', skill: skill('cleave'), target: echo, at: echo.pos });
  assert.deepEqual(casts(world), []);
  world.player.wielding = 'staff';
  const again: MonsterState = place(world, 'test_echo', { x: ARENA_CENTRE.x - 2, z: ARENA_CENTRE.z });
  firePowers(world, { on: 'kill', skill: skill('cleave'), target: again, at: again.pos });
  assert.deepEqual(casts(world), ['forkline']);
});

const VEIL: SkillTreeNodeDef = {
  id: 'test_veil',
  name: 'Veil',
  description: 'After a roll, Storm Bolt hits harder and pierces one more.',
  icon: 'focus',
  kind: 'notable',
  path: 'storm',
  column: 0,
  row: 0,
  requires: [],
  statMods: [],
  skillMods: [],
  variants: [],
  unlock: null,
  weapon: 'staff',
  triggers: [{ on: 'use', skill: { type: 'group', group: 'motion' }, target: 'any', every: 1, cooldown: 0, effect: { type: 'empower', skillMods: [{ target: { type: 'skill', skill: 'storm_bolt' }, field: 'damagePercent', value: 0.5 }, { target: { type: 'skill', skill: 'storm_bolt' }, field: 'pierce', value: 1 }], duration: 2, look: null } }],
};

function veiled(wielding: string): World {
  const world: World = arena(1, { ...content, skillTree: [...content.skillTree, VEIL] });
  world.player.allocated = ['test_veil'];
  world.player.wielding = wielding;
  return world;
}

function veiledBolt(world: World): SkillDef {
  return resolveSkill(world.content, skill('storm_bolt'), world.player.allocated, heldPowers(world.content, world.player.equipped, world.player.powers), [], world.player.wielding, world.player.changes);
}

function pierceOf(found: SkillDef): number {
  return found.delivery.type === 'projectile' ? found.delivery.pierce : -1;
}

void test('a tree place with a trigger empowers a skill for a while after a roll, and only a motion skill sets it off', (): void => {
  const world: World = veiled('staff');
  const plain: SkillDef = veiledBolt(world);
  assert.ok(!firePowers(world, { on: 'use', skill: skill('cleave'), target: null, at: world.player.pos }));
  assert.ok(firePowers(world, { on: 'use', skill: skill('dodge_roll'), target: null, at: world.player.pos }));
  const empowered: SkillDef = veiledBolt(world);
  assert.ok(Math.abs(empowered.damage.weaponPercent - plain.damage.weaponPercent * 1.5) < 1e-9);
  assert.equal(pierceOf(empowered), pierceOf(plain) + 1);
  assert.ok(firePowers(world, { on: 'use', skill: skill('dodge_roll'), target: null, at: world.player.pos }));
  assert.equal(world.player.powers.empowers.length, 1);
  assert.ok(!stepPowerState(world.player.powers, 1.9));
  assert.ok(stepPowerState(world.player.powers, 0.2));
  assert.deepEqual(veiledBolt(world).damage, plain.damage);
});

void test('a tree place off its weapon sets off no trigger', (): void => {
  const world: World = veiled('blade');
  assert.ok(!firePowers(world, { on: 'use', skill: skill('dodge_roll'), target: null, at: world.player.pos }));
  assert.deepEqual(world.player.powers.empowers, []);
});

const STILL: SkillTreeNodeDef = {
  ...VEIL,
  id: 'test_still',
  name: 'Still',
  description: 'Every four strikes of Cleave give each flask a charge.',
  weapon: null,
  triggers: [{ on: 'hit', skill: { type: 'skill', skill: 'cleave' }, target: 'any', every: 4, cooldown: 0.5, effect: { type: 'flask', charges: 1 } }],
};

function stilled(): World {
  const world: World = arena(1, { ...content, skillTree: [...content.skillTree, STILL] });
  world.player.allocated = ['test_still'];
  for (const flask of world.player.flasks) flask.charges = 0;
  return world;
}

function strike(world: World, times: number): void {
  for (let struck: number = 0; struck < times; struck += 1) firePowers(world, { on: 'hit', skill: skill('cleave'), target: null, at: world.player.pos });
}

function charges(world: World): number[] {
  return world.player.flasks.map((flask): number => flask.charges);
}

void test('a tree place gives each flask a charge for every few strikes, and not again until its cooldown has passed', (): void => {
  const world: World = stilled();
  assert.ok(world.player.flasks.length > 0);
  strike(world, 3);
  assert.ok(charges(world).every((held: number): boolean => held === 0));
  strike(world, 1);
  assert.ok(charges(world).every((held: number): boolean => held === 1));
  strike(world, 8);
  assert.ok(charges(world).every((held: number): boolean => held === 1));
  stepPowerState(world.player.powers, 0.5);
  strike(world, 4);
  assert.ok(charges(world).every((held: number): boolean => held === 2));
  firePowers(world, { on: 'hit', skill: skill('storm_bolt'), target: null, at: world.player.pos });
  assert.equal(world.player.powers.counts['place:test_still:0'] ?? 0, 0);
});

void test('a flask charge never fills a flask past its maximum', (): void => {
  const world: World = stilled();
  for (const flask of world.player.flasks) flask.charges = flask.def.maxCharges;
  strike(world, 4);
  assert.ok(world.player.flasks.every((flask): boolean => flask.charges === flask.def.maxCharges));
});

const shipped: Content = loadContent();
const MAELSTROM: readonly string[] = ['blade_thunderhead', 'heavy_hands', 'blade_1', 'whetstone', 'blade_4', 'whirling_cleave', 'endless_turn', 'millstone', 'riptide', 'blade_millrace'];

function maelstrom(wielding: string): World {
  const world: World = worldIn(shipped, 'hall_of_time', 3);
  world.player.allocated = [...MAELSTROM];
  world.player.wielding = wielding;
  for (const flask of world.player.flasks) flask.charges = 0;
  return world;
}

function shippedSkill(id: string): SkillDef {
  return must(shipped.skills.get(id), id);
}

function resolvedIn(world: World, id: string): SkillDef {
  return resolveSkill(shipped, shippedSkill(id), world.player.allocated, [], [], world.player.wielding, world.player.changes);
}

void test('with a blade in hand the Millwheel feeds the flasks through Millrace, and Riptide leaves its current where the roll lands', (): void => {
  const world: World = maelstrom('blade');
  const wheel: SkillDef = resolvedIn(world, 'cleave');
  assert.deepEqual([wheel.id, wheel.form], ['cleave', 'cleave_millwheel']);
  for (let struck: number = 0; struck < 4; struck += 1) firePowers(world, { on: 'hit', skill: shippedSkill('cleave'), target: null, at: world.player.pos });
  assert.ok(world.player.flasks.every((flask): boolean => flask.charges === 0));
  for (let struck: number = 0; struck < 4; struck += 1) firePowers(world, { on: 'hit', skill: wheel, target: null, at: world.player.pos });
  assert.ok(world.player.flasks.every((flask): boolean => flask.charges === 1));
  const start = { x: world.player.pos.x + 3, z: world.player.pos.z };
  firePowers(world, { on: 'use', skill: shippedSkill('dodge_roll'), target: null, at: start });
  assert.equal(world.echoes.length, 0);
  const roll: SkillDef = resolvedIn(world, 'dodge_roll');
  assert.deepEqual([roll.id, roll.form], ['dodge_roll', 'dodge_roll_riptide']);
  firePowers(world, { on: 'use', skill: roll, target: null, at: start });
  const current: EchoState = must(world.echoes.find((echo: EchoState): boolean => echo.skill.id === 'riptide_wake'), 'rip current');
  assert.deepEqual(current.origin, start);
});

void test('Millrace feeds no flask with a crossbow in hand', (): void => {
  const world: World = maelstrom('crossbow');
  const wheel: SkillDef = resolvedIn(maelstrom('blade'), 'cleave');
  for (let struck: number = 0; struck < 8; struck += 1) firePowers(world, { on: 'hit', skill: wheel, target: null, at: world.player.pos });
  assert.ok(world.player.flasks.every((flask): boolean => flask.charges === 0));
});

const EMBERWARDEN: readonly string[] = ['stone_thunderclap', 'tempered_body', 'stone_1', 'bedrock', 'shoulder_through', 'stone_4', 'gathered_clap'];

function emberwarden(wielding: string): World {
  const world: World = worldIn(shipped, 'hall_of_time', 3);
  world.player.allocated = [...EMBERWARDEN];
  world.player.wielding = wielding;
  return world;
}

void test('with a heavy weapon in hand Shoulder Through flares where the charge stops, and Gathered Clap burns and leaves burning ground', (): void => {
  const world: World = emberwarden('heavy');
  const roll: SkillDef = resolvedIn(world, 'dodge_roll');
  assert.deepEqual([roll.id, roll.form], ['dodge_roll', 'dodge_roll_shoulder']);
  const stop = { x: world.player.pos.x + 3, z: world.player.pos.z };
  firePowers(world, { on: 'use', skill: roll, target: null, at: stop });
  const flare: EchoState = must(world.echoes.find((echo: EchoState): boolean => echo.skill.id === 'shoulder_flare'), 'flare');
  assert.deepEqual(flare.origin, stop);
  const clap: SkillDef = resolvedIn(world, 'thunderclap');
  assert.deepEqual([clap.form, clap.leaves], ['thunderclap_gathered', 'gathered_embers']);
  assert.ok(clap.burn !== null);
});

void test('with a blade in hand the heavy places give no Shoulder Through', (): void => {
  const world: World = emberwarden('blade');
  const roll: SkillDef = resolvedIn(world, 'dodge_roll');
  assert.equal(roll.form, 'dodge_roll');
  firePowers(world, { on: 'use', skill: roll, target: null, at: world.player.pos });
  assert.equal(world.echoes.length, 0);
});

const FORKED_ROUTE: readonly string[] = ['echo_forkline', 'first_echo', 'echo_1', 'echo_15', 'echo_4', 'twice_swung', 'echo_5', 'echo_6', 'forked'];

void test('Forked: a hit of any main attack releases a Forkline, at most once per cooldown, with any weapon, and other skills release none', (): void => {
  const world: World = hero();
  world.player.allocated = [...FORKED_ROUTE];
  world.player.wielding = 'crossbow';
  const cooldown: number = must(content.skillTree.find((node: SkillTreeNodeDef): boolean => node.id === 'forked')?.triggers[0], 'forked trigger').cooldown;
  const target: MonsterState = place(world, 'test_shambler', { x: ARENA_CENTRE.x + 3, z: ARENA_CENTRE.z });
  firePowers(world, { on: 'hit', skill: skill('thunderclap'), target, at: target.pos });
  assert.deepEqual(casts(world), []);
  firePowers(world, { on: 'hit', skill: skill('quarrel_fan'), target, at: target.pos });
  firePowers(world, { on: 'hit', skill: skill('quarrel'), target, at: target.pos });
  assert.deepEqual(casts(world), ['forkline']);
  stepPowerState(world.player.powers, cooldown + 0.01);
  world.player.wielding = 'blade';
  firePowers(world, { on: 'hit', skill: skill('cleave_millwheel'), target, at: target.pos });
  assert.deepEqual(casts(world), ['forkline', 'forkline']);
});

function spinAmong(gear: readonly string[]): number {
  const world: World = hero();
  for (const base of gear) wear(world, base);
  refreshPlayer(world);
  world.player.mana = world.player.stats.maxMana;
  const posts: MonsterState[] = [0, 1, 2, 3, 4, 5].map((index: number): MonsterState => {
    const angle: number = (index / 6) * Math.PI * 2;
    const post: MonsterState = place(world, 'test_post', { x: ARENA_CENTRE.x + Math.cos(angle) * 1.9, z: ARENA_CENTRE.z + Math.sin(angle) * 1.9 });
    post.life = 100000;
    post.maxLife = 100000;
    post.cooldowns['test_grab'] = 1000;
    return post;
  });
  stepWorld(world, [{ type: 'hold', slot: 0, down: true }, { type: 'skill', slot: 0, aim: { x: ARENA_CENTRE.x + 0.01, z: ARENA_CENTRE.z }, targetId: null }], 1 / 60);
  for (let frame: number = 0; frame < 90; frame += 1) stepWorld(world, [], 1 / 60);
  assert.equal(world.player.action?.phase, 'channel');
  return posts.reduce((sum: number, post: MonsterState): number => sum + distance(post.pos, world.player.pos), 0) / posts.length;
}

void test('the Gyre-Stitched Breeches pull a ring of foes in toward a hero turning the Millwheel, where the wheel alone leaves them standing', (): void => {
  const alone: number = spinAmong(['the_millwheel']);
  const pulled: number = spinAmong(['the_millwheel', 'gyre_stitched_breeches']);
  assert.ok(alone > 1.8, `the wheel alone moved them to ${alone.toFixed(2)}`);
  assert.ok(pulled < alone - 0.3, `pulled to ${pulled.toFixed(2)} against ${alone.toFixed(2)}`);
});

void test('the Bellwether Helm answers every fourth blow a monster lands with a Thunderclap around the hero, counts none while it rests, and ignores blows from no monster', (): void => {
  const world: World = hero();
  wear(world, 'bellwether_helm');
  refreshPlayer(world);
  const foe: MonsterState = place(world, 'test_shambler', { x: ARENA_CENTRE.x + 1, z: ARENA_CENTRE.z });
  const blow: SkillDef = skill('test_grab');
  const land = (sourceId: number): void => {
    world.player.life = 100000;
    world.player.invulnerable = 0;
    applyHit(world, { ...offenceOf(foe), sourceId }, world.player, blow, { x: -1, z: 0 });
  };
  for (let count: number = 0; count < 3; count += 1) land(foe.id);
  assert.deepEqual(casts(world), []);
  land(foe.id);
  assert.deepEqual(casts(world), ['thunderclap']);
  assert.deepEqual(must(world.echoes[0], 'clap').origin, { x: world.player.pos.x, z: world.player.pos.z });
  for (let count: number = 0; count < 4; count += 1) land(foe.id);
  assert.equal(world.echoes.length, 1);
  stepPowerState(world.player.powers, 1.1);
  for (let count: number = 0; count < 8; count += 1) land(-1);
  assert.equal(world.echoes.length, 1);
  for (let count: number = 0; count < 4; count += 1) land(foe.id);
  assert.deepEqual(casts(world), ['thunderclap', 'thunderclap']);
});

void test('the Anvilback Hauberk slams a Thunderclap when a Heaving Cleave is let go, not after a plain swing, and every enemy a Thunderclap strikes stacks armour up to fifteen', (): void => {
  const world: World = hero();
  wear(world, 'anvilback_hauberk');
  const heave: SkillDef = resolveSkill(content, skill('cleave'), ['heaving_cleave']);
  assert.equal(heave.form, 'cleave_heave');
  firePowers(world, { on: 'use', skill: skill('cleave'), target: null, at: world.player.pos });
  assert.deepEqual(casts(world), []);
  firePowers(world, { on: 'use', skill: heave, target: null, at: world.player.pos });
  firePowers(world, { on: 'use', skill: heave, target: null, at: world.player.pos });
  assert.deepEqual(casts(world), ['thunderclap']);
  assert.deepEqual(must(world.echoes[0], 'clap').origin, { x: world.player.pos.x, z: world.player.pos.z });
  const target: MonsterState = place(world, 'test_shambler', { x: ARENA_CENTRE.x + 2, z: ARENA_CENTRE.z });
  for (let hit: number = 0; hit < 20; hit += 1) firePowers(world, { on: 'hit', skill: skill('thunderclap'), target, at: target.pos });
  firePowers(world, { on: 'hit', skill: skill('cleave'), target, at: target.pos });
  assert.ok(Math.abs(must(buffMods(world.player.powers)[0], 'armour').value - 60) < 1e-9);
});

void test('the Nightjar Gloves fan every Quarrel into three bolts for two seconds after a roll, and nothing else sets them off', (): void => {
  const world: World = hero();
  wear(world, 'nightjar_gloves');
  const quarrel: SkillDef = skill('quarrel');
  const fanned = (): SkillDef => resolveSkill(content, quarrel, [], heldPowers(content, world.player.equipped, world.player.powers));
  assert.ok(!firePowers(world, { on: 'use', skill: skill('cleave'), target: null, at: world.player.pos }));
  assert.equal(fanned(), quarrel);
  assert.ok(firePowers(world, { on: 'use', skill: skill('dodge_roll'), target: null, at: world.player.pos }));
  const fan: SkillDef = fanned();
  assert.ok(fan.delivery.type === 'projectile' && quarrel.delivery.type === 'projectile');
  assert.equal(fan.delivery.count, quarrel.delivery.count + 2);
  assert.equal(fan.delivery.spreadDegrees, quarrel.delivery.spreadDegrees + 14);
  assert.equal(resolveSkill(content, skill('storm_bolt'), [], heldPowers(content, world.player.equipped, world.player.powers)), skill('storm_bolt'));
  stepPowerState(world.player.powers, 2.1);
  assert.equal(fanned(), quarrel);
});

void test('the Longsight Coat sends Quarrels further and harder, and every shot throws back three times as far', (): void => {
  const coat = wornPowers(content, { ...hero().player.equipped, chest: item('longsight_coat', 60) });
  const quarrel: SkillDef = skill('quarrel');
  const far: SkillDef = resolveSkill(content, quarrel, [], coat);
  assert.ok(far.delivery.type === 'projectile' && quarrel.delivery.type === 'projectile');
  assert.ok(Math.abs(far.delivery.range - quarrel.delivery.range * 1.4) < 1e-9);
  assert.ok(Math.abs(far.damage.weaponPercent - quarrel.damage.weaponPercent * 1.25) < 1e-9);
  assert.ok(Math.abs(far.knockback - quarrel.knockback * 3) < 1e-9);
  const wave: SkillDef = skill('ghost_wave');
  assert.ok(Math.abs(resolveSkill(content, wave, [], coat).knockback - wave.knockback * 3) < 1e-9);
  assert.equal(resolveSkill(content, skill('cleave'), [], coat), skill('cleave'));
});
