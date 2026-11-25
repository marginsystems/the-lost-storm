import assert from 'node:assert/strict';
import { test } from 'node:test';
import { content, createFakeClock, createFakeTimers, createMemoryStore, makeSave } from '../../test/backend-support.ts';
import { generateItem } from '../../sim/items.ts';
import { createRng } from '../../sim/rng.ts';
import type { SaveData } from '../../sim/save.ts';
import type { ItemInstance } from '../../sim/world/types.ts';
import type { Backend, KeyValueStore } from './backend.ts';
import { createBackend } from './create.ts';
import { addCharacter, switchCharacter } from './roster-store.ts';
import type { RosterPlace } from './roster-store.ts';
import { STASH_KEY } from './shared-stash.ts';

const QUIET = { info: (): void => undefined, warn: (): void => undefined };

function gear(uid: number): ItemInstance {
  const base: string | undefined = [...content.itemBases.values()].find((candidate): boolean => candidate.slot !== null)?.id;
  const rarity: string | undefined = content.rarities[0]?.id;
  assert.ok(base !== undefined && rarity !== undefined);
  const item: ItemInstance | null = generateItem(content, createRng(uid), uid, 1, base, rarity);
  assert.ok(item !== null);
  return item;
}

function stashing(items: readonly (ItemInstance | null)[]): SaveData {
  const save: SaveData = makeSave(2, 0);
  return { ...save, stash: save.stash.map((entry: ItemInstance | null, index: number): ItemInstance | null => items[index] ?? entry) };
}

function open(store: KeyValueStore): Backend {
  const clock = createFakeClock();
  return createBackend(content, undefined, { fetch: (): Promise<Response> => Promise.reject(new Error('offline')), store, clock: clock.read, timers: createFakeTimers(clock).timers, log: QUIET, characterKeys: [] });
}

function place(store: KeyValueStore): RosterPlace {
  return { store, serverUrl: null, extraKeys: [] };
}

function uids(items: readonly (ItemInstance | null)[] | null): readonly number[] {
  return (items ?? []).flatMap((item: ItemInstance | null): number[] => (item === null ? [] : [item.uid]));
}

void test('what one character puts in the stash is there for a new character on the same device', async (): Promise<void> => {
  const store = createMemoryStore();
  const first: Backend = open(store);
  await first.load();
  first.save(stashing([gear(11)]));
  assert.ok(addCharacter(place(store), 'Bright Reed', null, (): number => 0.5) !== null);
  const second: Backend = open(store);
  assert.equal(await second.load(), null);
  assert.deepEqual(uids(second.stash()), [11]);
});

void test('a character switched back to sees what another character took out', async (): Promise<void> => {
  const store = createMemoryStore();
  const first: Backend = open(store);
  await first.load();
  first.save(stashing([gear(11), gear(12)]));
  const key: string | null = addCharacter(place(store), 'Bright Reed', null, (): number => 0.5);
  assert.ok(key !== null);
  const second: Backend = open(store);
  await second.load();
  second.save(stashing([null, gear(12)]));
  assert.ok(switchCharacter(place(store), 'first'));
  const back: Backend = open(store);
  await back.load();
  assert.deepEqual(uids(back.stash()), [12]);
});

void test('the first time, every character stash already on the device is merged into the shared one', async (): Promise<void> => {
  const store = createMemoryStore();
  const first: Backend = open(store);
  await first.load();
  first.save(stashing([gear(21)]));
  addCharacter(place(store), 'Bright Reed', null, (): number => 0.5);
  const second: Backend = open(store);
  await second.load();
  second.save(stashing([gear(22), gear(23)]));
  store.remove(STASH_KEY);
  const merged: Backend = open(store);
  await merged.load();
  assert.deepEqual(uids(merged.stash()), [22, 23, 21]);
});

void test('Start over keeps the shared stash for the next character', async (): Promise<void> => {
  const store = createMemoryStore();
  const first: Backend = open(store);
  await first.load();
  first.save(stashing([gear(31)]));
  await first.reset();
  const fresh: Backend = open(store);
  assert.equal(await fresh.load(), null);
  assert.deepEqual(uids(fresh.stash()), [31]);
});

void test('a character save the device could not write leaves the shared stash as it was', async (): Promise<void> => {
  const store = createMemoryStore();
  const first: Backend = open(store);
  await first.load();
  first.save(stashing([gear(41)]));
  const refusing: KeyValueStore = { read: (key: string): string | null => store.read(key), write: (key: string, value: string): boolean => (key === STASH_KEY ? store.write(key, value) : false), remove: (key: string): void => store.remove(key) };
  const failing: Backend = open(refusing);
  await failing.load();
  assert.equal(failing.save(stashing([null])), false);
  const next: Backend = open(store);
  await next.load();
  assert.deepEqual(uids(next.stash()), [41]);
});
