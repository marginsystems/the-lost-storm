import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Content, SkillDef, SkillTreeNodeDef } from './content/types.ts';
import { resolveSkill } from './stats.ts';

const content: Content = loadContent();
const MILLWHEEL: SkillDef = must(content.skills.get('cleave_millwheel'), 'cleave_millwheel');

function steadyAt(allocated: readonly string[]): number {
  return must(resolveSkill(content, MILLWHEEL, allocated).momentum ?? undefined, 'momentum').steady;
}

void test('Keel holds the Millwheel steady with half the momentum, and the plain Millwheel is unchanged', (): void => {
  const plain: number = must(MILLWHEEL.momentum ?? undefined, 'momentum').steady;
  assert.equal(steadyAt([]), plain);
  assert.equal(steadyAt(['maelstrom_keel']), plain * 0.5);
});

void test('the momentum a Millwheel needs to stand steady never drops below the cap on lowering it', (): void => {
  const plain: number = must(MILLWHEEL.momentum ?? undefined, 'momentum').steady;
  const cap: number = must(content.player.skillCaps.find((entry): boolean => entry.field === 'momentumSteadyPercent')?.min ?? undefined, 'cap');
  const keel: SkillTreeNodeDef = must(content.skillTree.find((node: SkillTreeNodeDef): boolean => node.id === 'maelstrom_keel'), 'keel');
  const deeper: SkillTreeNodeDef = { ...keel, skillMods: [{ target: { type: 'skill', skill: MILLWHEEL.id }, field: 'momentumSteadyPercent', value: -5 }] };
  const tree: Content = { ...content, skillTree: [...content.skillTree.filter((node: SkillTreeNodeDef): boolean => node.id !== keel.id), deeper] };
  const steady: number = must(resolveSkill(tree, MILLWHEEL, ['maelstrom_keel']).momentum ?? undefined, 'momentum').steady;
  assert.ok(Math.abs(steady - plain * (1 + cap)) < 1e-9, `${steady}`);
});
