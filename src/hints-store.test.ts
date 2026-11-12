import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { KeyValueStore } from './backend/backend.ts';
import { createHintStore, HINTS_KEY } from './hints-store.ts';
import type { HintStore } from './hints-store.ts';

function memory(): KeyValueStore & { readonly data: Map<string, string> } {
  const data: Map<string, string> = new Map<string, string>();
  return {
    data,
    read: (key: string): string | null => data.get(key) ?? null,
    write: (key: string, value: string): boolean => {
      data.set(key, value);
      return true;
    },
    remove: (key: string): void => {
      data.delete(key);
    },
  };
}

void test('nothing stored reads as no record and hints on', (): void => {
  const store: HintStore = createHintStore(memory());
  assert.equal(store.read(), null);
  assert.equal(store.isEnabled(), true);
});

void test('remembered hints persist once each and the flag survives', (): void => {
  const backing = memory();
  const store: HintStore = createHintStore(backing);
  store.remember('move');
  store.remember('move');
  store.setEnabled(false);
  const again: HintStore = createHintStore(backing);
  assert.deepEqual(again.read()?.seen, ['move']);
  assert.equal(again.isEnabled(), false);
});

void test('a damaged record is ignored and clear forgets everything', (): void => {
  const backing = memory();
  backing.data.set(HINTS_KEY, '{nope');
  const store: HintStore = createHintStore(backing);
  assert.equal(store.read(), null);
  store.remember('a');
  store.clear();
  assert.equal(store.read(), null);
});
