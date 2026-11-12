import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CONTENT } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import type { MonsterModDef } from './combat-types.ts';
import { combatProblems, monsterMod, monsterTraits, packMods, skillMotion } from './parse-combat.ts';
import type { Content, MonsterDef, SkillDef, ZoneDef } from './types.ts';

void test('a monster without combat traits is steady, unguarded and plain', (): void => {
  assert.deepEqual(monsterTraits({}, 'm'), { poise: { knockback: 1, stagger: 1 }, guard: null, deathSkill: null, summon: null, mods: [] });
  assert.deepEqual(skillMotion({}, 's'), { leap: null, root: 0 });
  assert.deepEqual(packMods({}, 'p'), []);
});

void test('combat traits are read and checked', (): void => {
  const read = monsterTraits({ poise: { knockback: 0.3, stagger: 0.5 }, guard: { arcDegrees: 140, damageTaken: 0.2, breakStagger: 0.45, breakTime: 1.4 }, deathSkill: 'x', summon: { monster: null, count: 2, cooldown: 4, limit: 3 } }, 'm');
  assert.deepEqual(read.poise, { knockback: 0.3, stagger: 0.5 });
  assert.equal(read.guard?.breakTime, 1.4);
  assert.equal(read.summon?.monster, null);
  assert.throws(() => monsterTraits({ poise: { knockback: 2, stagger: 0 } }, 'm'), /from 0 to 1/);
  assert.throws(() => monsterTraits({ summon: { monster: null, count: 1.5, cooldown: 4, limit: 3 } }, 'm'), /whole numbers/);
  assert.throws(() => monsterTraits({ guard: { arcDegrees: 720, damageTaken: 0.2, breakStagger: 0.45, breakTime: 1.4 } }, 'm'), /at most 360/);
  assert.throws(() => skillMotion({ root: -1 }, 's'), /zero or more/);
  assert.equal(skillMotion({ leap: { distance: 8, airTime: 0.3 } }, 's').leap?.stopShort, 0);
});

void test('a monster modifier reads every field', (): void => {
  const mod: MonsterModDef = monsterMod({ id: 'm', prefix: 'P', lifeScale: 2, damageScale: 1, speedScale: 1, sizeScale: 1, xpScale: 1, lootScale: 1, color: '#fff', deathSkill: null }, 'mod');
  assert.equal(mod.summon, null);
  assert.throws(() => monsterMod({ id: 'm' }, 'mod'), /prefix/);
});

void test('combat problems name bad bursts, bad summons, unknown pack mods, misplaced leaps and unreachable orbits', (): void => {
  assert.deepEqual(combatProblems(ARENA_CONTENT), []);
  const thrall: MonsterDef = must(ARENA_CONTENT.monsters.get('bone_thrall'), 'thrall');
  const bolt: SkillDef = must(ARENA_CONTENT.skills.get('hex_bolt'), 'bolt');
  const zone: ZoneDef = must(ARENA_CONTENT.zones.get('shallows'), 'zone');
  const broken: Content = {
    ...ARENA_CONTENT,
    skills: new Map<string, SkillDef>([...ARENA_CONTENT.skills, ['bad_leap', { ...bolt, id: 'bad_leap', leap: { distance: 4, stopShort: 0, airTime: 9 } }]]),
    monsters: new Map<string, MonsterDef>([
      ...ARENA_CONTENT.monsters,
      ['bad_boss', { ...must(ARENA_CONTENT.monsters.get('mason'), 'mason'), id: 'bad_boss', guard: { arcDegrees: 90, damageTaken: 0.5, breakStagger: 1, breakTime: 1 } }],
      ['bad', { ...thrall, id: 'bad', deathSkill: 'hex_bolt', summon: { monster: 'one_before', count: 1, cooldown: 1, limit: 1 }, behaviour: { type: 'stalker', orbitRange: 30 } }],
    ]),
    zones: new Map<string, ZoneDef>([...ARENA_CONTENT.zones, [zone.id, { ...zone, packs: [{ x: 1, z: 1, members: [{ monster: 'bone_thrall', count: 1, mods: ['nope'] }, { monster: 'bone_thrall', count: 1, mods: ['test_volatile', 'test_volatile', 'test_brood', 'test_brood'] }], when: [] }] }]]),
  };
  const problems: string[] = combatProblems(broken);
  for (const expected of ['bursts with skill hex_bolt', 'summons one_before', 'circles at 30', 'unknown mod nope', 'more than one mod with a death burst', 'more than one mod that summons', 'bad_leap leaps', 'bad_leap is in the air', 'boss bad_boss cannot have a guard']) {
    assert.ok(problems.some((problem: string): boolean => problem.includes(expected)), `${expected} in ${problems.join('; ')}`);
  }
});
