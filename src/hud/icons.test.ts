import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, ItemBaseDef, SkillDef } from '../../sim/content/types.ts';
import { iconSvg } from './icons.ts';

const content: Content = loadContent();

void test('every skill has its own drawn glyph, never the fallback', (): void => {
  const fallback: string = iconSvg('');
  const missing: string[] = [...content.skills.values()].filter((skill: SkillDef): boolean => iconSvg(skill.icon) === fallback).map((skill: SkillDef): string => skill.id);
  assert.deepEqual(missing, []);
});

void test('every item base has its own drawn glyph, and a head piece with no worn model never shows the hood-shaped helm', (): void => {
  const fallback: string = iconSvg('');
  const bases: ItemBaseDef[] = [...content.itemBases.values()];
  assert.deepEqual(bases.filter((base: ItemBaseDef): boolean => iconSvg(base.icon) === fallback).map((base: ItemBaseDef): string => base.id), []);
  for (const base of bases) if (base.slot === 'head' && !base.wornModel) assert.notEqual(base.icon, 'helm', base.id);
});
