import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOBBY_RESUME, markResume, takeResume } from './lobby-resume.ts';
import type { FlagStore } from './lobby-resume.ts';

function memory(): FlagStore & { readonly items: Map<string, string> } {
  const items: Map<string, string> = new Map<string, string>();
  return {
    items,
    getItem: (key: string): string | null => items.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      items.set(key, value);
    },
    removeItem: (key: string): void => {
      items.delete(key);
    },
  };
}

void test('a resume mark is read once, so a later reload lands on the title again', (): void => {
  const store = memory();
  assert.equal(takeResume(store), false);
  assert.equal(markResume(store), true);
  assert.equal(store.items.get(LOBBY_RESUME.key), LOBBY_RESUME.value);
  assert.equal(takeResume(store), true);
  assert.equal(takeResume(store), false);
});

void test('a storage that refuses the mark never fails the switch', (): void => {
  const refusing: FlagStore = {
    getItem: (): string | null => {
      throw new Error('blocked');
    },
    setItem: (): void => {
      throw new Error('blocked');
    },
    removeItem: (): void => {
      throw new Error('blocked');
    },
  };
  assert.equal(markResume(refusing), false);
  assert.equal(takeResume(refusing), false);
});
