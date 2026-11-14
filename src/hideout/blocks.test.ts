import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BlocksState } from './blocks.ts';
import { blockSettled, blocksFetched, blockText, isBlocked, NO_BLOCKS } from './blocks.ts';

void test('the block list from the server is matched without case or spacing', (): void => {
  const state: BlocksState = blocksFetched(NO_BLOCKS, { kind: 'ok', names: ['Ash Walker'] });
  assert.equal(state.loaded, true);
  assert.equal(isBlocked(state, 'ash walker'), true);
  assert.equal(isBlocked(state, ' AshWalker '), true);
  assert.equal(isBlocked(state, 'Bright Reed'), false);
});

void test('a failed fetch keeps what was known, and an old server turns blocking off', (): void => {
  const known: BlocksState = blocksFetched(NO_BLOCKS, { kind: 'ok', names: ['Ash'] });
  assert.equal(blocksFetched(known, { kind: 'failed' }), known);
  const old: BlocksState = blocksFetched(known, { kind: 'unsupported' });
  assert.equal(old.available, false);
  assert.equal(isBlocked(old, 'Ash'), false);
});

void test('a block or unblock the server confirmed changes the list, and a refusal changes nothing', (): void => {
  const blocked: BlocksState = blockSettled(NO_BLOCKS, 'Ash', { kind: 'ok', blocked: true });
  assert.equal(isBlocked(blocked, 'ash'), true);
  assert.equal(isBlocked(blockSettled(blocked, 'Ash', { kind: 'ok', blocked: false }), 'ash'), false);
  assert.equal(blockSettled(blocked, 'Bo', { kind: 'refused', reason: 'own_name' }), blocked);
  assert.equal(blockSettled(blocked, 'Bo', { kind: 'failed' }), blocked);
  assert.equal(blockSettled(blocked, 'Bo', { kind: 'unsupported' }).available, false);
});

void test('every block answer that is not a success says why', (): void => {
  assert.equal(blockText({ kind: 'ok', blocked: true }, 'Ash', true), null);
  assert.equal(blockText({ kind: 'failed' }, 'Ash', true), 'Ash could not be blocked.');
  assert.equal(blockText({ kind: 'failed' }, 'Ash', false), 'Ash could not be unblocked.');
  assert.equal(blockText({ kind: 'refused', reason: 'block_limit' }, 'Ash', true), 'Your block list is full.');
  assert.equal(blockText({ kind: 'refused', reason: 'own_name' }, 'Ash', true), 'That is one of your own characters.');
  assert.equal(blockText({ kind: 'refused', reason: 'no_such_character' }, 'Ash', true), 'No one is called Ash.');
  assert.equal(blockText({ kind: 'unsupported' }, 'Ash', true), 'Blocking is not available here.');
});
