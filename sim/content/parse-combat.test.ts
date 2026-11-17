import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CONTENT } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import type { MonsterModDef } from './combat-types.ts';
import { combatProblems, markDelivery, monsterMod, monsterTraits, packMods, skillMotion } from './parse-combat.ts';
import type { Content, MonsterDef, SkillDef, ZoneDef } from './types.ts';

void test('a monster without combat traits is steady, unguarded and plain', (): void => {
  assert.deepEqual(monsterTraits({ faction: 'f' }, 'm'), { poise: { knockback: 1, stagger: 1, resolve: 0 }, guard: null, deathSkill: null, summon: null, mods: [], faction: 'f', dormant: null, alarm: null, support: null, barks: [], regen: 0, rank: null, heatproof: false, crust: null, element: null, trail: null });
  assert.deepEqual(skillMotion({}, 's'), { leap: null, root: 0, hold: 0, stun: 0, echo: 0, echoTurn: 0, echoShare: 1, lifeOnHit: 0, leech: 0, commit: null, leaves: null });
  assert.equal(skillMotion({ stun: 0.6, leech: 0.03 }, 's').stun, 0.6);
  assert.equal(skillMotion({ stun: 0.6, leech: 0.03 }, 's').leech, 0.03);
  assert.throws(() => skillMotion({ stun: -1 }, 's'), /zero or more/);
  assert.throws(() => skillMotion({ leech: 1.5 }, 's'), /from 0 to 1/);
  assert.deepEqual(packMods({}, 'p'), []);
});

void test('combat traits are read and checked', (): void => {
  const read = monsterTraits({ poise: { knockback: 0.3, stagger: 0.5 }, guard: { arcDegrees: 140, damageTaken: 0.2, breakStagger: 0.45, breakTime: 1.4 }, deathSkill: 'x', summon: { monster: null, count: 2, cooldown: 4, limit: 3 }, faction: 'f' }, 'm');
  assert.deepEqual(read.poise, { knockback: 0.3, stagger: 0.5, resolve: 0 });
  assert.equal(read.guard?.breakTime, 1.4);
  assert.equal(read.summon?.monster, null);
  assert.throws(() => monsterTraits({ poise: { knockback: 2, stagger: 0 }, faction: 'f' }, 'm'), /from 0 to 1/);
  assert.equal(monsterTraits({ poise: { knockback: 0.3, stagger: 0.5, resolve: 3 }, faction: 'f' }, 'm').poise.resolve, 3);
  assert.throws(() => monsterTraits({ poise: { knockback: 0.3, stagger: 0.5, resolve: -1 }, faction: 'f' }, 'm'), /zero or more/);
  assert.deepEqual(skillMotion({ commit: { at: 0.35, breakStagger: 0.55 } }, 's').commit, { at: 0.35, breakStagger: 0.55 });
  assert.throws(() => skillMotion({ commit: { at: 1.5, breakStagger: 0.45 } }, 's'), /from 0 to 1/);
  assert.throws(() => monsterTraits({ summon: { monster: null, count: 1.5, cooldown: 4, limit: 3 }, faction: 'f' }, 'm'), /whole numbers/);
  assert.throws(() => monsterTraits({ guard: { arcDegrees: 720, damageTaken: 0.2, breakStagger: 0.45, breakTime: 1.4 }, faction: 'f' }, 'm'), /at most 360/);
  assert.throws(() => skillMotion({ root: -1 }, 's'), /zero or more/);
  assert.deepEqual(skillMotion({ leap: { distance: 8, airTime: 0.3 } }, 's').leap, { distance: 8, stopShort: 0, airTime: 0.3, lane: false });
  assert.equal(skillMotion({ leap: { distance: 4, airTime: 0.3, lane: true } }, 's').leap?.lane, true);
  assert.throws(() => skillMotion({ leap: { distance: 4, airTime: 0.3, lane: 'yes' } }, 's'), /lane/);
});

void test('a monster modifier reads every field', (): void => {
  const mod: MonsterModDef = monsterMod({ id: 'm', prefix: 'P', lifeScale: 2, damageScale: 1, speedScale: 1, sizeScale: 1, xpScale: 1, lootScale: 1, color: '#fff', deathSkill: null, line: 'Hits hard' }, 'mod');
  assert.equal(mod.summon, null);
  assert.equal(mod.line, 'Hits hard');
  assert.deepEqual([mod.knockbackScale, mod.guard, mod.element, mod.trail, mod.motes], [1, null, null, null, null]);
  const full: MonsterModDef = monsterMod({ id: 'f', prefix: 'F', lifeScale: 1, damageScale: 1, speedScale: 1, sizeScale: 1, xpScale: 1, lootScale: 1, color: '#fff', deathSkill: null, line: 'All of it', knockbackScale: 0.3, element: { type: 'frost', share: 0.6, resist: 0.5 }, trail: { skill: 'wake', every: 1.4, limit: 4 }, motes: { color: '#ff0000', rate: 3, lift: 1 } }, 'mod');
  assert.deepEqual([full.knockbackScale, full.element, full.trail, full.motes?.rate], [0.3, { type: 'frost', share: 0.6, resist: 0.5 }, { skill: 'wake', every: 1.4, limit: 4 }, 3]);
  assert.throws(() => monsterMod({ id: 'm', prefix: 'P', lifeScale: 1, damageScale: 1, speedScale: 1, sizeScale: 1, xpScale: 1, lootScale: 1, color: '#fff', deathSkill: null }, 'mod'), /line/);
  assert.throws(() => monsterMod({ id: 'm', prefix: 'P', lifeScale: 1, damageScale: 1, speedScale: 1, sizeScale: 1, xpScale: 1, lootScale: 1, color: '#fff', deathSkill: null, line: 'x', element: { type: 'fire', share: 0.5, resist: 0.5 } }, 'mod'), /fire|storm|frost/);
  assert.throws(() => monsterMod({ id: 'm' }, 'mod'), /prefix/);
});

void test('combat problems name bad bursts, bad summons, unknown pack mods, misplaced leaps, unreachable orbits and springs', (): void => {
  assert.deepEqual(combatProblems(ARENA_CONTENT), []);
  const thrall: MonsterDef = must(ARENA_CONTENT.monsters.get('mended'), 'thrall');
  const bolt: SkillDef = must(ARENA_CONTENT.skills.get('mender_needle'), 'bolt');
  const zone: ZoneDef = must(ARENA_CONTENT.zones.get('hall_of_time'), 'zone');
  const broken: Content = {
    ...ARENA_CONTENT,
    skills: new Map<string, SkillDef>([...ARENA_CONTENT.skills, ['bad_leap', { ...bolt, id: 'bad_leap', leap: { distance: 4, stopShort: 0, airTime: 9, lane: false } }]]),
    monsters: new Map<string, MonsterDef>([
      ...ARENA_CONTENT.monsters,
      ['bad_boss', { ...must(ARENA_CONTENT.monsters.get('unfinished_colossus'), 'unfinished_colossus'), id: 'bad_boss', guard: { arcDegrees: 90, damageTaken: 0.5, breakStagger: 1, breakTime: 1 } }],
      ['bad', { ...thrall, id: 'bad', deathSkill: 'mender_needle', summon: { monster: 'stormcaller_rival', count: 1, cooldown: 1, limit: 1 }, behaviour: { type: 'stalker', orbitRange: 30 } }],
      ['bad_lurker', { ...thrall, id: 'bad_lurker', behaviour: { type: 'ambush', spring: 30 } }],
    ]),
    zones: new Map<string, ZoneDef>([...ARENA_CONTENT.zones, [zone.id, { ...zone, packs: [{ x: 1, z: 1, members: [{ monster: 'mended', count: 1, mods: ['nope'] }, { monster: 'mended', count: 1, mods: ['test_volatile', 'test_volatile', 'test_brood', 'test_brood'] }], when: [] }] }]]),
  };
  const problems: string[] = combatProblems(broken);
  for (const expected of ['bursts with skill mender_needle', 'summons stormcaller_rival', 'circles at 30', 'springs from 30', 'unknown mod nope', 'more than one mod with a death burst', 'more than one mod that summons', 'bad_leap leaps', 'bad_leap is in the air', 'boss bad_boss cannot have a guard']) {
    assert.ok(problems.some((problem: string): boolean => problem.includes(expected)), `${expected} in ${problems.join('; ')}`);
  }
});

void test('a mark is one by default and a row needs a whole count and a spacing', (): void => {
  assert.deepEqual(markDelivery({ range: 9, radius: 2, delay: 1 }, 'm'), { type: 'mark', range: 9, radius: 2, delay: 1, count: 1, spacing: 0, step: 0 });
  assert.deepEqual(markDelivery({ range: 9, radius: 1, delay: 1, count: 5, spacing: 1.6, step: 0.1 }, 'm'), { type: 'mark', range: 9, radius: 1, delay: 1, count: 5, spacing: 1.6, step: 0.1 });
  assert.throws(() => markDelivery({ range: 9, radius: 1, delay: 1, count: 2.5, spacing: 1 }, 'm'), /whole number/);
  assert.throws(() => markDelivery({ range: 9, radius: 1, delay: 1, count: 3 }, 'm'), /spacing/);
  assert.equal(skillMotion({ echo: 0.9, echoTurn: 45 }, 's').echoTurn, 45);
});
