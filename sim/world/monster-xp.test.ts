import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { MonsterScaling } from '../content/types.ts';
import { monsterXpScale } from './monster-xp.ts';

const shipped: MonsterScaling = loadContent().world.scaling;
const plain: MonsterScaling = { ...shipped, xpBeyond: null };

function linear(level: number): number {
  return 1 + shipped.xpPerLevel * (level - 1);
}

void test('without a rule monster experience rises by the same step at every level', (): void => {
  for (const level of [1, 10, 30, 31, 50]) assert.equal(monsterXpScale(plain, level), linear(level));
});

void test('up to the level the rule starts at, the shipped monsters give what they always gave', (): void => {
  const beyond = shipped.xpBeyond;
  assert.notEqual(beyond, null);
  for (let level: number = 1; level <= (beyond?.from ?? 0); level += 1) assert.equal(monsterXpScale(shipped, level), linear(level), `level ${level}`);
});

void test('above that level experience grows by the rule every level from where the straight line stopped', (): void => {
  const beyond = shipped.xpBeyond;
  if (beyond === null) throw new Error('the shipped world has no rule above the old cap');
  for (let level: number = beyond.from + 2; level <= 50; level += 1) {
    assert.ok(Math.abs(monsterXpScale(shipped, level) / monsterXpScale(shipped, level - 1) - beyond.growth) < 1e-9, `level ${level}`);
  }
  assert.equal(monsterXpScale(shipped, beyond.from + 1), linear(beyond.from) * beyond.lift * beyond.growth);
});
