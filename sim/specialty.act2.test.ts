import assert from 'node:assert/strict';
import { test } from 'node:test';
import budgetData from '../data/tree-budgets.json' with { type: 'json' };
import { loadContent } from './content/content.ts';
import type { Content, SkillTreeNodeDef, SpecialtyDef } from './content/types.ts';
import { earnedPoints } from './save.ts';
import { armPlaces, specialtyPlaces } from './specialty.ts';
import type { TreeBudgets } from './tree-stack.ts';
import { readBudgetLevels } from './tree-stack.ts';

const content: Content = loadContent();
const TOP: number = Math.max(...readBudgetLevels(budgetData, 'tree budgets').map((budgets: TreeBudgets): number => budgets.level));

function radius(node: SkillTreeNodeDef): number {
  return Math.hypot(node.column, node.row);
}

void test('a hero at the top budgeted level still fills well under half of the places their weapon reaches', (): void => {
  const top: number = earnedPoints(content, TOP, content.chart.grants.map((grant): string => grant.id));
  for (const arm of ['stone', 'storm', 'blade', 'wind']) {
    const own: readonly SpecialtyDef[] = content.chart.specialties.filter((entry: SpecialtyDef): boolean => entry.path === arm);
    const reach: number = armPlaces(content, arm).length + own.reduce((total: number, entry: SpecialtyDef): number => total + specialtyPlaces(content, entry.id).length, 0);
    assert.ok(top * 2.5 < reach, `${arm}: ${top} points against ${reach} places`);
  }
});

void test('every specialty reaches past its old rim with a lane that ends in a keystone that changes how the build plays', (): void => {
  for (const specialty of content.chart.specialties) {
    const places: readonly SkillTreeNodeDef[] = specialtyPlaces(content, specialty.id);
    const deepest: SkillTreeNodeDef | undefined = places.toSorted((a: SkillTreeNodeDef, b: SkillTreeNodeDef): number => radius(b) - radius(a)).find((node: SkillTreeNodeDef): boolean => node.kind === 'keystone');
    assert.ok(deepest !== undefined, specialty.id);
    assert.ok(deepest.triggers.length > 0, `${deepest.id} changes how the build plays`);
    assert.ok(places.filter((node: SkillTreeNodeDef): boolean => radius(node) > radius(deepest) - 8).length >= 8, `${specialty.id} has a deep lane`);
  }
});
