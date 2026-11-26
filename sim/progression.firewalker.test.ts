import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Content, SkillTreeNodeDef } from './content/types.ts';
import { placeLinks } from './progression.ts';

const content: Content = loadContent();

function place(id: string): SkillTreeNodeDef {
  return must(content.skillTree.find((node: SkillTreeNodeDef): boolean => node.id === id), id);
}

function unlockerOf(skill: string): string {
  return must(content.skillTree.find((node: SkillTreeNodeDef): boolean => node.unlock === skill), skill).id;
}

void test('the fire path unlocks Firewall itself, and no place teaches Fire Slam any more', (): void => {
  assert.equal(place('stone_fire_burst').unlock, 'firewall');
  assert.equal(content.skillTree.some((node: SkillTreeNodeDef): boolean => node.unlock === 'fire_slam'), false);
  assert.equal(content.chart.retired.skills.get('fire_slam'), 'firewall');
});

void test('Flashover is reached only through the place that unlocks the skill it changes', (): void => {
  const node: SkillTreeNodeDef = place('stone_flashover');
  const base: string = must(node.variants[0], 'stone_flashover').skill;
  assert.deepEqual(placeLinks(content).get('stone_flashover'), [unlockerOf(base)]);
});
