import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, ARENA_CONTENT, arena, place } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import type { AreaDelivery } from '../content/shape-types.ts';
import type { SkillDef } from '../content/types.ts';
import { clearAreas, placeArea, stepAreas } from './areas.ts';
import type { AuraReading } from './aura.ts';
import { exposedScale, heroAuras } from './aura.ts';
import { refreshHero } from './character.ts';
import { applyHit, offenceOf } from './combat.ts';
import type { AreaState, MonsterState, World, WorldEvent } from './types.ts';

const DT: number = 1 / 30;
const STATIC_FIELD: SkillDef = must(ARENA_CONTENT.skills.get('static_field'), 'static_field');
const STORM_BOLT: SkillDef = must(ARENA_CONTENT.skills.get('storm_bolt'), 'storm_bolt');
const CLEAVE: SkillDef = must(ARENA_CONTENT.skills.get('cleave'), 'cleave');

function auraArea(skill: SkillDef): AreaDelivery {
  if (skill.delivery.type !== 'area' || skill.delivery.aura === null) throw new Error(`${skill.id} is an aura`);
  return skill.delivery;
}

function stormHero(): World {
  const world: World = arena(5);
  world.player.learned = ['storm_bolt', 'static_field'];
  world.player.bar = ['storm_bolt', 'static_field', null, null, null, null];
  refreshHero(world, world.player);
  return world;
}

function boltCooldown(world: World): number {
  return must(world.player.skills.find((skill: SkillDef | null): boolean => skill?.id === 'storm_bolt'), 'storm bolt on the bar').cooldown;
}

function standing(world: World): readonly AreaState[] {
  return world.areas.filter((area: AreaState): boolean => area.skill.id === 'static_field');
}

function runFor(world: World, seconds: number): void {
  for (let time: number = 0; time < seconds; time += DT) stepAreas(world, DT);
}

void test('Static Field is an aura around its caster that strikes nothing and lasts about as long as its cooldown', (): void => {
  const delivery: AreaDelivery = auraArea(STATIC_FIELD);
  assert.equal(delivery.anchor, 'caster');
  assert.equal(delivery.pulse, 0);
  assert.equal(STATIC_FIELD.category, 'lasting');
  assert.ok(delivery.duration >= STATIC_FIELD.cooldown && delivery.duration - STATIC_FIELD.cooldown <= 5, `${delivery.duration} s up, ${STATIC_FIELD.cooldown} s cooldown`);
});

void test('while Static Field stands the hero regains more mana and lightning recharges sooner, and both end with it', (): void => {
  const world: World = stormHero();
  const regen: number = world.player.stats.manaRegen;
  const cooldown: number = boltCooldown(world);
  placeArea(world, offenceOf(world.player), STATIC_FIELD, world.player.pos);
  assert.equal(world.player.stats.manaRegen, regen + 4);
  assert.ok(Math.abs(boltCooldown(world) - cooldown * 0.8) < 1e-9, `${boltCooldown(world)}`);
  runFor(world, auraArea(STATIC_FIELD).duration - 1);
  assert.equal(standing(world).length, 1);
  assert.equal(world.player.stats.manaRegen, regen + 4);
  runFor(world, 2);
  assert.equal(standing(world).length, 0);
  assert.equal(world.player.stats.manaRegen, regen);
  assert.equal(boltCooldown(world), cooldown);
  assert.deepEqual(world.player.powers.buffs, []);
  assert.deepEqual(world.player.powers.empowers, []);
});

void test('the aura follows the hero', (): void => {
  const world: World = stormHero();
  placeArea(world, offenceOf(world.player), STATIC_FIELD, world.player.pos);
  world.player.pos = { x: world.player.pos.x + 3, z: world.player.pos.z - 2 };
  runFor(world, 0.1);
  const area: AreaState = must(standing(world)[0], 'the aura');
  assert.deepEqual(area.pos, world.player.pos);
});

void test('raising it again replaces the standing aura, so its changes are never carried twice', (): void => {
  const world: World = stormHero();
  const regen: number = world.player.stats.manaRegen;
  placeArea(world, offenceOf(world.player), STATIC_FIELD, world.player.pos);
  runFor(world, 10);
  placeArea(world, offenceOf(world.player), STATIC_FIELD, world.player.pos);
  assert.equal(standing(world).length, 1);
  assert.equal(world.player.stats.manaRegen, regen + 4);
  assert.equal(world.player.powers.buffs.length, 1);
  assert.equal(world.player.powers.empowers.length, 1);
  assert.ok(world.events.some((event: WorldEvent): boolean => event.type === 'area' && event.stage === 'end'));
  runFor(world, auraArea(STATIC_FIELD).duration - 1);
  assert.equal(standing(world).length, 1);
});

void test('a zone change or a death clears the aura and its changes with it', (): void => {
  const world: World = stormHero();
  const regen: number = world.player.stats.manaRegen;
  placeArea(world, offenceOf(world.player), STATIC_FIELD, world.player.pos);
  clearAreas(world);
  assert.equal(world.player.stats.manaRegen, regen);
  assert.deepEqual(world.player.powers.buffs, []);
});

function charged(): { world: World; near: MonsterState; far: MonsterState } {
  const world: World = stormHero();
  const near: MonsterState = place(world, 'test_shambler', { x: ARENA_CENTRE.x + 3, z: ARENA_CENTRE.z });
  const far: MonsterState = place(world, 'test_shambler', { x: ARENA_CENTRE.x + 13, z: ARENA_CENTRE.z });
  world.player.pos = { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z };
  placeArea(world, offenceOf(world.player), STATIC_FIELD, world.player.pos);
  return { world, near, far };
}

void test('an enemy inside the aura takes more from lightning skills only; one outside it, or the hero, takes no more', (): void => {
  const { world, near, far } = charged();
  assert.ok(Math.abs(exposedScale(world, world.player, near, STORM_BOLT) - 1.2) < 1e-9);
  assert.equal(exposedScale(world, world.player, near, CLEAVE), 1);
  assert.equal(exposedScale(world, world.player, far, STORM_BOLT), 1);
  assert.equal(exposedScale(world, near, world.player, STORM_BOLT), 1);
  assert.equal(exposedScale(world, null, near, STORM_BOLT), 1);
});

void test('a lightning hit on an enemy inside the aura lands harder by the exposed share', (): void => {
  const fixed: SkillDef = { ...STORM_BOLT, damage: { type: 'physical', weaponPercent: 0, flatMin: 10, flatMax: 10 } };
  const inside = charged();
  const outside: World = stormHero();
  const plain: MonsterState = place(outside, 'test_shambler', { x: ARENA_CENTRE.x + 3, z: ARENA_CENTRE.z });
  inside.world.player.stats = { ...inside.world.player.stats, critChance: 0 };
  outside.player.stats = { ...outside.player.stats, critChance: 0 };
  const before: number = inside.near.life;
  applyHit(inside.world, offenceOf(inside.world.player), inside.near, fixed, { x: 1, z: 0 });
  const plainBefore: number = plain.life;
  applyHit(outside, offenceOf(outside.player), plain, fixed, { x: 1, z: 0 });
  const dealt: number = before - inside.near.life;
  const plainDealt: number = plainBefore - plain.life;
  assert.ok(plainDealt > 0);
  assert.ok(Math.abs(dealt - plainDealt * 1.2) <= 1, `${dealt} vs ${plainDealt}`);
});

void test('the hero reads each aura it holds with the time it has left', (): void => {
  const world: World = stormHero();
  assert.deepEqual(heroAuras(world, world.player), []);
  placeArea(world, offenceOf(world.player), STATIC_FIELD, world.player.pos);
  runFor(world, 5);
  const [reading] = heroAuras(world, world.player);
  const held: AuraReading = must(reading, 'an aura');
  assert.equal(held.skill.id, 'static_field');
  assert.equal(held.duration, auraArea(STATIC_FIELD).duration);
  assert.ok(Math.abs(held.timeLeft - (held.duration - 5)) < 0.05, `${held.timeLeft}`);
});
