import assert from 'node:assert/strict';
import { test } from 'node:test';
import budgetData from '../data/tree-budgets.json' with { type: 'json' };
import { loadContent } from './content/content.ts';
import type { Content } from './content/types.ts';
import type { BudgetMiss, StatStack, TreeBudgets } from './tree-stack.ts';
import { describeMiss, heroPoints, overBudget, readBudgetLevels, treeStacks, unbudgeted } from './tree-stack.ts';

const content: Content = loadContent();
const levels: readonly TreeBudgets[] = readBudgetLevels(budgetData, 'tree budgets');
const stacksAt: ReadonlyMap<number, readonly StatStack[]> = new Map<number, readonly StatStack[]>(levels.map((budgets: TreeBudgets): [number, readonly StatStack[]] => [budgets.level, treeStacks(content, heroPoints(content, budgets.level))]));

function stacksOf(budgets: TreeBudgets): readonly StatStack[] {
  return stacksAt.get(budgets.level) ?? [];
}

void test('the tree is budgeted for the first act at level 30 and the second at level 50', (): void => {
  assert.deepEqual(levels.map((budgets: TreeBudgets): number => budgets.level), [30, 50]);
});

void test('every stat and skill field the tree grants has a stacking budget at every budgeted level', (): void => {
  for (const budgets of levels) assert.deepEqual(unbudgeted(stacksOf(budgets), budgets), [], `level ${budgets.level}`);
});

void test('every stacking budget names a stat or skill field the tree still grants', (): void => {
  for (const budgets of levels) {
    const granted: ReadonlySet<string> = new Set<string>(stacksOf(budgets).map((stack: StatStack): string => stack.key));
    assert.deepEqual([...budgets.limits.keys()].filter((key: string): boolean => !granted.has(key)), [], `level ${budgets.level}`);
  }
});

void test('no stat or skill field stacks past its budget with every point a hero has at each budgeted level', (): void => {
  for (const budgets of levels) {
    const misses: readonly BudgetMiss[] = overBudget(stacksOf(budgets), budgets);
    assert.deepEqual(misses.map(describeMiss), [], `level ${budgets.level}`);
  }
});

void test('a later level never budgets a stat or skill field below an earlier level', (): void => {
  for (const [at, budgets] of levels.entries()) {
    const before: TreeBudgets | undefined = levels[at - 1];
    if (before === undefined) continue;
    for (const [key, limit] of before.limits) assert.ok((budgets.limits.get(key) ?? Infinity) >= limit, `${key} at level ${budgets.level}`);
  }
});
