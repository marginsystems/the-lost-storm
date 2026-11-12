import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, SkillDef } from '../../sim/content/types.ts';
import { iconSvg } from './icons.ts';

const content: Content = loadContent();

void test('every skill has its own drawn glyph, never the fallback', (): void => {
  const fallback: string = iconSvg('');
  const missing: string[] = [...content.skills.values()].filter((skill: SkillDef): boolean => iconSvg(skill.icon) === fallback).map((skill: SkillDef): string => skill.id);
  assert.deepEqual(missing, []);
});
