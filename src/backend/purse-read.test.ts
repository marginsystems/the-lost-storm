import assert from 'node:assert/strict';
import { test } from 'node:test';
import { content } from '../../test/backend-support.ts';
import { emptyFold, NO_FOLD, readEntries, readEntry, readFold } from './purse-read.ts';

const ITEM = { id: 'itm_AAAAAAAAAAAAAAAAAAAAAA', base: 'rusted_blade', rarity: 'magic', level: 3, affixes: [] };

void test('a purse entry is read with its kind, signed gold and its item and direction together', (): void => {
  assert.deepEqual(readEntry(content, { id: 3, kind: 'buy', gold: -40, item: ITEM, direction: 'in' }), { id: 3, kind: 'buy', gold: -40, item: ITEM, direction: 'in' });
  assert.deepEqual(readEntry(content, { id: 4, kind: 'collect', gold: 90, item: null, direction: null }), { id: 4, kind: 'collect', gold: 90, item: null, direction: null });
  const bad: readonly unknown[] = [
    null,
    { id: 0, kind: 'buy', gold: 0, item: null, direction: null },
    { id: 1.5, kind: 'buy', gold: 0, item: null, direction: null },
    { id: 1, kind: 'steal', gold: 0, item: null, direction: null },
    { id: 1, kind: 'buy', gold: 0.5, item: null, direction: null },
    { id: 1, kind: 'buy', gold: 0, item: ITEM, direction: null },
    { id: 1, kind: 'buy', gold: 0, item: null, direction: 'in' },
    { id: 1, kind: 'buy', gold: 0, item: { ...ITEM, id: 'itm_bad' }, direction: 'in' },
    { id: 1, kind: 'buy', gold: 0, item: ITEM, direction: 'sideways' },
  ];
  for (const value of bad) assert.equal(readEntry(content, value), null);
});

void test('one unreadable entry rejects the whole list, so no entry is skipped past', (): void => {
  assert.deepEqual(readEntries(content, [{ id: 1, kind: 'list', gold: 0, item: ITEM, direction: 'out' }]), [{ id: 1, kind: 'list', gold: 0, item: ITEM, direction: 'out' }]);
  assert.equal(readEntries(content, [{ id: 1, kind: 'list', gold: 0, item: ITEM, direction: 'out' }, { id: 2 }]), null);
  assert.equal(readEntries(content, 'many'), null);
});

void test('a save answer without a fold, as from an older server, folds nothing', (): void => {
  assert.deepEqual(readFold(content, { save: null, revision: 1 }), NO_FOLD);
  assert.equal(emptyFold(readFold(content, null)), true);
  assert.deepEqual(readFold(content, { folded: [{ id: 2, kind: 'collect', gold: 5, item: null, direction: null }], stripped: [ITEM.id] }), { folded: [{ id: 2, kind: 'collect', gold: 5, item: null, direction: null }], stripped: [ITEM.id], unverified: [] });
  assert.deepEqual(readFold(content, { folded: [], stripped: [], unverified: [ITEM.id] }), { folded: [], stripped: [], unverified: [ITEM.id] });
  assert.equal(emptyFold(readFold(content, { unverified: [ITEM.id] })), false);
  assert.deepEqual(readFold(content, { unverified: ['nope'] }).unverified, []);
  assert.deepEqual(readFold(content, { folded: 'x', stripped: ['not a ledger id'] }), NO_FOLD);
});
