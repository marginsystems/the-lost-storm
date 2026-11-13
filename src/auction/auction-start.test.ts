import assert from 'node:assert/strict';
import { test } from 'node:test';
import { foldCommand } from './auction-start.ts';

void test('a fold from a save answer becomes one purse command with its entries and strips', (): void => {
  const entry = { id: 2, kind: 'collect', gold: 10, item: null, direction: null } as const;
  assert.deepEqual(foldCommand({ folded: [entry], stripped: ['itm_AAAAAAAAAAAAAAAAAAAAAA'], unverified: ['itm_BBBBBBBBBBBBBBBBBBBBBB'] }), { type: 'purse', entries: [entry], stripped: ['itm_AAAAAAAAAAAAAAAAAAAAAA'], unverified: ['itm_BBBBBBBBBBBBBBBBBBBBBB'] });
});
