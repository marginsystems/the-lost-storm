import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../../sim/content/content.ts';
import type { Content, ItemBaseDef, SkillDef, SkillTreeNodeDef, SkillVariant } from '../../../sim/content/types.ts';
import { must } from '../../../test/support.ts';
import { SKILL_ART } from './index.ts';

const content: Content = loadContent();

function heldByHeroes(): readonly string[] {
  const fromBook: readonly string[] = content.player.skillBook.map((entry: { readonly skill: string }): string => entry.skill);
  const fromTree: readonly string[] = content.skillTree.flatMap((node: SkillTreeNodeDef): readonly string[] => [...(node.unlock === null ? [] : [node.unlock]), ...node.variants.map((entry: SkillVariant): string => entry.becomes)]);
  const fromItems: readonly string[] = [...content.itemBases.values()].flatMap((base: ItemBaseDef): readonly string[] => base.variants.concat(base.power?.variants ?? []).map((entry: SkillVariant): string => entry.becomes));
  return [...new Set<string>([...fromBook, ...fromTree, ...fromItems])].toSorted();
}

void test('every skill a hero can hold is drawn in full colour under its own icon', (): void => {
  const missing: string[] = heldByHeroes().filter((id: string): boolean => {
    const skill: SkillDef = must(content.skills.get(id), id);
    return skill.icon !== id || !SKILL_ART.has(id);
  });
  assert.deepEqual(missing, []);
});

void test('every drawn icon belongs to a skill that shows it', (): void => {
  const shown: ReadonlySet<string> = new Set<string>([...content.skills.values()].map((skill: SkillDef): string => skill.icon));
  assert.deepEqual([...SKILL_ART.keys()].filter((id: string): boolean => !shown.has(id)), []);
});
