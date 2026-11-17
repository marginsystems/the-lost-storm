import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CONTENT } from '../../test/arena-support.ts';
import tailwindData from '../../data/tailwind.json' with { type: 'json' };
import { tailwind, tailwindProblems } from './parse-tailwind.ts';
import type { TailwindDef, TailwindTier } from './tailwind-types.ts';
import type { Content } from './types.ts';

const SHIPPED: TailwindDef = tailwind(tailwindData, 'tailwind');

void test('the shipped streak reads cleanly with rising tiers and a weight for every rank', (): void => {
  assert.ok(SHIPPED.tiers.length >= 5);
  SHIPPED.tiers.forEach((tier: TailwindTier, index: number): void => {
    const before: TailwindTier | undefined = SHIPPED.tiers[index - 1];
    if (before === undefined) return;
    assert.ok(tier.at > before.at);
    assert.ok(tier.xp >= before.xp);
    assert.ok(tier.loot >= before.loot);
    assert.ok(tier.fuse >= before.fuse);
  });
  assert.deepEqual(tailwindProblems(ARENA_CONTENT), []);
});

void test('the reader refuses tiers that do not rise, no tiers at all and a fuse cap below its length', (): void => {
  const [first, second] = tailwindData.tiers;
  if (first === undefined || second === undefined) throw new Error('the shipped streak has two tiers');
  assert.throws((): TailwindDef => tailwind({ ...tailwindData, tiers: [first, { ...second, at: first.at }] }, 't'), /more than the one before/);
  assert.throws((): TailwindDef => tailwind({ ...tailwindData, tiers: [] }, 't'), /at least one tier/);
  assert.throws((): TailwindDef => tailwind({ ...tailwindData, burst: { ...tailwindData.burst, most: 0.5 } }, 't'), /cap below/);
  assert.throws((): TailwindDef => tailwind({ ...tailwindData, tiers: [{ ...first, speed: 2 }] }, 't'), /from 0 to 1/);
});

void test('the cross-check names a weight for an unknown rank and a rank with no weight', (): void => {
  const content: Content = { ...ARENA_CONTENT, tailwind: { ...SHIPPED, weights: { ...SHIPPED.weights, ranks: { normal: 1, magic: 2, mythic: 9 } } } };
  assert.deepEqual(tailwindProblems(content).toSorted(), ['tailwind has no weight for rank rare', 'tailwind weighs unknown rank mythic']);
});
