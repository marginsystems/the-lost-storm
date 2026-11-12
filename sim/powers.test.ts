import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, ARENA_CONTENT, arena, place } from '../test/arena-support.ts';
import { must } from '../test/support.ts';
import type { Content, MonsterDef, SkillDef } from './content/types.ts';
import { generateItem, slotOf } from './items.ts';
import { buffMods, emptyPowerState, firePowers, stepPowerState, wornPowers, wouldPassLimit } from './powers.ts';
import { createRng } from './rng.ts';
import { applyHit, offenceOf } from './world/combat.ts';
import type { EchoState, ItemInstance, MonsterState, PowerState, World } from './world/types.ts';

const shambler: MonsterDef = must(ARENA_CONTENT.monsters.get('test_shambler'), 'shambler');
const content: Content = {
  ...ARENA_CONTENT,
  monsters: new Map<string, MonsterDef>([...ARENA_CONTENT.monsters, ['test_echo', { ...shambler, id: 'test_echo', faction: ARENA_CONTENT.moments.faction }]]),
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
