import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content.ts';
import { tradeProblems } from './parse-trade.ts';

void test('the hired porter must name an existing NPC that provides the service', (): void => {
  const content = loadContent();
  for (const npc of ['missing', 'warden_trader']) {
    const trade = { ...content.trade, porter: { ...content.trade.porter, npc } };
    assert.ok(tradeProblems({ ...content, trade }).some((problem: string): boolean => problem.includes(npc)));
  }
});
