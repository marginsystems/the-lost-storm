import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, ARENA_CONTENT, arena, place } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import type { MonsterModDef } from '../content/combat-types.ts';
import type { MonsterDef } from '../content/types.ts';
import { monsterScale } from './monster-scale.ts';
import { modsNamed, withMods } from './elites.ts';
import { stunMonster } from './stun.ts';
import type { MonsterState, World } from './types.ts';

const thrall: MonsterDef = must(ARENA_CONTENT.monsters.get('mended'), 'thrall');
const swift: MonsterModDef = must(ARENA_CONTENT.monsterMods.get('test_swift'), 'swift');
const brood: MonsterModDef = must(ARENA_CONTENT.monsterMods.get('test_brood'), 'brood');
const volatile: MonsterModDef = must(ARENA_CONTENT.monsterMods.get('test_volatile'), 'volatile');

void test('a modifier scales the monster it is given and names it', (): void => {
  const elite: MonsterDef = withMods(thrall, [swift]);
  assert.equal(elite.name, `Swift ${thrall.name}`);
  assert.equal(elite.moveSpeed, thrall.moveSpeed * swift.speedScale);
  assert.equal(elite.life, thrall.life * swift.lifeScale);
  assert.equal(elite.scale, thrall.scale * swift.sizeScale);
  assert.equal(elite.xp, thrall.xp * swift.xpScale);
  assert.equal(elite.color, swift.color);
  assert.deepEqual(elite.mods, [swift.id]);
  assert.equal(elite.id, thrall.id);
});

void test('modifiers stack in order and carry their death burst and summons', (): void => {
  const elite: MonsterDef = withMods(thrall, [volatile, brood]);
  assert.equal(elite.name, `Brood Volatile ${thrall.name}`);
  assert.equal(elite.deathSkill, volatile.deathSkill);
  assert.deepEqual(elite.summon, brood.summon);
  assert.deepEqual(elite.mods, [volatile.id, brood.id]);
  assert.ok(elite.loot.goldChance <= 1 && elite.loot.itemChance <= 1);
  assert.equal(withMods(thrall, []), thrall);
});

void test('unknown modifier names are skipped', (): void => {
  assert.deepEqual(
    modsNamed(ARENA_CONTENT.monsterMods, ['test_swift', 'nothing']).map((mod: MonsterModDef): string => mod.id),
    ['test_swift'],
  );
});

void test('a pack member spawns with the modifiers its zone gives it', (): void => {
  const world: World = arena(11);
  const elite: MonsterState = place(world, 'mended', ARENA_CENTRE, ['test_swift']);
  assert.deepEqual(elite.def.mods, ['test_swift']);
  assert.equal(elite.maxLife, Math.round(thrall.life * swift.lifeScale * monsterScale(world.content.world.scaling, elite.level).life));
  assert.ok(elite.radius > thrall.radius * thrall.scale);
});

void test('a warded monster guards its front, an unyielding one barely staggers or moves when struck, and a stun still lands on it', (): void => {
  const brute: MonsterDef = must(ARENA_CONTENT.monsters.get('unfinished_taker'), 'taker');
  const warded: MonsterModDef = must(ARENA_CONTENT.monsterMods.get('warded'), 'warded');
  const unyielding: MonsterModDef = must(ARENA_CONTENT.monsterMods.get('unyielding'), 'unyielding');
  assert.equal(brute.guard, null);
  assert.deepEqual(withMods(brute, [warded]).guard, warded.guard);
  const steady: MonsterDef = withMods(brute, [unyielding]);
  assert.ok(Math.abs(steady.poise.knockback - brute.poise.knockback * unyielding.knockbackScale) < 1e-12);
  assert.ok(Math.abs(steady.poise.stagger - brute.poise.stagger * unyielding.staggerScale) < 1e-12);
  assert.ok(steady.poise.knockback > 0 && steady.poise.stagger > 0, 'resists, never immune');
  const world: World = arena(2, { ...ARENA_CONTENT, monsters: new Map<string, MonsterDef>([...ARENA_CONTENT.monsters, ['steady_taker', { ...steady, id: 'steady_taker' }]]) });
  const monster: MonsterState = place(world, 'steady_taker', ARENA_CENTRE);
  assert.ok(stunMonster(world, monster, 1) > 0);
});
