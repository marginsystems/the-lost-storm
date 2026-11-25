import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Content, SkillTreeNodeDef } from './content/types.ts';
import { placeLinks } from './progression.ts';

const content: Content = loadContent();

function unlockerOf(skill: string): string {
  return must(content.skillTree.find((node: SkillTreeNodeDef): boolean => node.unlock === skill), skill).id;
}

void test('Firewall and Flashover are reached only through the place that unlocks the skill they change', (): void => {
  for (const id of ['stone_firewall', 'stone_flashover']) {
    const node: SkillTreeNodeDef = must(content.skillTree.find((place: SkillTreeNodeDef): boolean => place.id === id), id);
    const base: string = must(node.variants[0], id).skill;
    assert.deepEqual(placeLinks(content).get(id), [unlockerOf(base)], id);
  }
});
