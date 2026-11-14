import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMemoryStore } from '../../test/backend-support.ts';
import { createMutes, MUTE_KEY, readMuted } from './mute.ts';

void test('a muted name is kept across a reload and matches whatever the case', (): void => {
  const store = createMemoryStore();
  const mutes = createMutes(store);
  assert.equal(mutes.toggle('Wren'), true);
  assert.equal(mutes.has('wren'), true);
  assert.equal(createMutes(store).has('WREN'), true);
  assert.equal(mutes.toggle('wren'), false);
  assert.equal(createMutes(store).has('Wren'), false);
});

void test('a stored mute list that cannot be read mutes no one', (): void => {
  assert.deepEqual([...readMuted('{oops')], []);
  assert.deepEqual([...readMuted('{"a":1}')], []);
  assert.deepEqual([...readMuted('["Ash", 3, ""]')], ['ash']);
  const store = createMemoryStore();
  store.entries.set(MUTE_KEY, 'nonsense');
  assert.equal(createMutes(store).has('Ash'), false);
});

void test('a store that refuses writes still mutes for this visit', (): void => {
  const store = createMemoryStore();
  store.failWrites = true;
  const mutes = createMutes(store);
  mutes.toggle('Ash');
  assert.equal(mutes.has('ash'), true);
});

void test('the list of muted names is what the server is told, oldest first', (): void => {
  const mutes = createMutes(createMemoryStore());
  mutes.toggle('Wren');
  mutes.toggle('Bo Reed');
  assert.deepEqual(mutes.list(), ['wren', 'bo reed']);
  mutes.toggle('wren');
  assert.deepEqual(mutes.list(), ['bo reed']);
});
