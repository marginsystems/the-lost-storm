import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { KeyValueStore } from '../backend/backend.ts';
import type { Leaderboard } from '../backend/api.ts';
import { HERO_NAME_KEY, keepHeroName, pendingRename, readHeroName, stepWanted } from './hero-name.ts';

function memory(): KeyValueStore {
  const values: Map<string, string> = new Map<string, string>();
  return {
    read: (key: string): string | null => values.get(key) ?? null,
    write: (key: string, value: string): boolean => {
      values.set(key, value);
      return true;
    },
    remove: (key: string): void => {
      values.delete(key);
    },
  };
}

function board(name: string | null, chosen: boolean): Leaderboard {
  return { top: [], you: name === null ? null : { rank: 1, name, level: 1, furthest: 'The In-Between', online: true, account: null, chosen }, online: 1, characters: 1, levelUps: [] };
}

void test('every new character is asked for a name, with or without a server', (): void => {
  assert.equal(stepWanted(true, null, false), true);
  assert.equal(stepWanted(true, board('Tavin', true), true), true);
  assert.equal(stepWanted(false, null, false), false);
  assert.equal(stepWanted(false, board('Guest 4821', false), true), true);
  assert.equal(stepWanted(false, board('Tavin', true), true), false);
});

void test('the chosen name is kept on this device and a bad stored one is ignored', (): void => {
  const store: KeyValueStore = memory();
  assert.equal(readHeroName(store), null);
  keepHeroName(store, '  Halvard   Moss ');
  assert.equal(readHeroName(store), 'Halvard Moss');
  store.write(HERO_NAME_KEY, 'x');
  assert.equal(readHeroName(store), null);
});

void test('a name kept offline goes to the server once an account exists that has not chosen one', (): void => {
  assert.equal(pendingRename('Halvard', board('Guest 4821', false), true), 'Halvard');
  assert.equal(pendingRename('Halvard', board('Tavin', true), true), null);
  assert.equal(pendingRename('Halvard', board('Guest 4821', false), false), null);
  assert.equal(pendingRename(null, board('Guest 4821', false), true), null);
  assert.equal(pendingRename('Halvard', null, true), null);
});
