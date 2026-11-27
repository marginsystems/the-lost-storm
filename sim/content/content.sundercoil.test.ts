import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from './content.ts';
import type { BossPhase, BossSkill, Content, MonsterDef, RigDef, ZoneDef } from './types.ts';

void test('the third Hourfall level fields Sundercoil with a separate jaw action for bite and venom', (): void => {
  const content: Content = loadContent();
  const cave: ZoneDef = must(content.zones.get('under_hall_3'), 'third Hourfall level');
  const boss: MonsterDef = must(content.monsters.get('sundercoil'), 'Sundercoil');
  assert.ok(cave.packs.some((pack): boolean => pack.members.some((member): boolean => member.monster === boss.id && member.count === 1)));
  const rig: RigDef = must(content.rigs.get(boss.rig), boss.rig);
  assert.notEqual(rig.id, must(content.monsters.get('cave_serpent'), 'Cave Serpent').rig);
  const attacks: Set<string> = new Set(must(boss.boss, boss.id).phases.flatMap((phase: BossPhase): string[] => phase.skills.map((entry: BossSkill): string => entry.skill)));
  const action = (skill: string): string => {
    assert.ok(attacks.has(skill));
    const animation: string = must(content.skills.get(skill), skill).animation;
    return must(rig.clips.actions[animation], animation).clip;
  };
  assert.equal(new Set([action('serpent_strike'), action('venom_spit'), action('coil_crush')]).size, 3);
});
