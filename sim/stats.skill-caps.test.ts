import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content/content.ts';
import type { Content, SkillDef } from './content/types.ts';
import { cappedSkillMod, resolveSkill } from './stats.ts';

const content: Content = loadContent();
const ROLL_COOLDOWN: readonly string[] = ['windborne', 'shadow_dancer', 'static_step', 'never_still'];

function roll(): SkillDef {
  const skill: SkillDef | undefined = content.skills.get('dodge_roll');
  if (skill === undefined) throw new Error('no dodge_roll');
  return skill;
}

void test('a skill cap holds a field between its floor and its ceiling and leaves other fields alone', (): void => {
  const caps = [{ field: 'cooldownPercent' as const, min: -0.6, max: null }, { field: 'chains' as const, min: null, max: 8 }];
  assert.equal(cappedSkillMod(caps, 'cooldownPercent', -1.2), -0.6);
  assert.equal(cappedSkillMod(caps, 'cooldownPercent', -0.3), -0.3);
  assert.equal(cappedSkillMod(caps, 'chains', 11), 8);
  assert.equal(cappedSkillMod(caps, 'areaPercent', 5), 5);
});

void test('places that would cut a cooldown to nothing stop at the player\'s cooldown floor', (): void => {
  const floor: number | null = content.player.skillCaps.find((cap): boolean => cap.field === 'cooldownPercent')?.min ?? null;
  assert.ok(floor !== null);
  const capped: SkillDef = resolveSkill(content, roll(), ROLL_COOLDOWN);
  assert.ok(Math.abs(capped.cooldown - roll().cooldown * (1 + floor)) < 1e-9);
  const open: Content = { ...content, player: { ...content.player, skillCaps: [] } };
  assert.equal(resolveSkill(open, roll(), ROLL_COOLDOWN).cooldown, 0);
});

void test('Flashover gains recovery through level 50 and combines with fire cooldown places up to the shared floor', (): void => {
  const base = content.skills.get('banked_fire');
  assert.ok(base !== undefined);
  const cooldown = (level: number, places: readonly string[]): number =>
    resolveSkill(content, base, ['stone_banked_fire', 'stone_flashover', ...places], [], [], 'heavy', {}, level).cooldown;
  assert.ok(cooldown(50, []) < cooldown(49, []));
  assert.ok(Math.abs(cooldown(21, ['kiln_draught_hole']) - 1.08) < 1e-9);
  assert.ok(Math.abs(cooldown(50, ['kiln_draught_hole', 'kiln_flue']) - 0.72) < 1e-9);
});

void test('Held Breath follows Firewalker recovery when the hero has learned a fire spell', (): void => {
  const aura = content.skills.get('held_breath');
  assert.ok(aura !== undefined);
  const standalone = resolveSkill(content, aura, ['stone_held_breath'], [], [], 'crossbow', {}, 21);
  const firewalker = resolveSkill(content, aura, ['stone_held_breath', 'stone_thunderclap'], [], [], 'crossbow', {}, 21);
  assert.equal(standalone.cooldown, aura.cooldown);
  assert.ok(Math.abs(firewalker.cooldown - aura.cooldown / 1.5) < 1e-9);
});
