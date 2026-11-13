import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHarness, createMemoryStore, makeSave } from '../../test/backend-support.ts';
import type { Harness, ServerAccount } from '../../test/backend-support.ts';
import { isFields } from '../../sim/content/read.ts';
import { must } from '../../test/support.ts';
import type { Backend, KeyValueStore } from './backend.ts';
import { createCharactersApi } from './characters-api.ts';
import type { CharactersApi, CreateResult } from './characters-api.ts';
import { SAVE_KEY } from './local.ts';
import { activeSlot, ROSTER, ROSTER_KEY } from './roster.ts';
import type { Roster, Slot } from './roster.ts';
import { addCharacter, loadRoster, noteActive, parkedKey, prepareRoster, readSummary, reconcileRoster, removeCharacter, switchCharacter, UNREADABLE_ROSTER_KEY } from './roster-store.ts';
import type { RosterPlace } from './roster-store.ts';
import { parseSyncRecord, serializeSyncRecord, SYNC_KEY } from './sync-record.ts';

const URL_A: string = 'http://localhost:8787';
const EXTRA: string = 'the-lost-storm.test-extra';

function place(store: KeyValueStore, serverUrl: string | null): RosterPlace {
  return { store, serverUrl, extraKeys: [EXTRA] };
}

function counter(): () => number {
  let next: number = 0;
  return (): number => {
    next += 1;
    return next / 1000;
  };
}

function levelIn(store: KeyValueStore): unknown {
  const text: string | null = store.read(SAVE_KEY);
  if (text === null) return null;
  const parsed: unknown = JSON.parse(text);
  return isFields(parsed) ? parsed['level'] : null;
}

function tokenIn(harness: Harness): string {
  return must(parseSyncRecord(harness.store.read(SYNC_KEY), URL_A), 'the sync record').token;
}

function api(harness: Harness): CharactersApi {
  return createCharactersApi(URL_A, harness.server.fetch);
}

async function played(harness: Harness, level: number): Promise<Backend> {
  const backend: Backend = harness.open();
  await backend.load();
  backend.save(makeSave(level, 0));
  await harness.timers.advance(1000);
  return backend;
}

async function named(harness: Harness, name: string): Promise<string> {
  const made: CreateResult = await api(harness).create(tokenIn(harness).split('.')[0] ?? '', name, AbortSignal.timeout(1000));
  return made.kind === 'ok' ? made.character.id : assert.fail(`no character named ${name}`);
}

function activeKeyOf(harness: Harness, name: string): string {
  return must(loadRoster(harness.store).slots.find((slot: Slot): boolean => slot.name === name), `the slot named ${name}`).key;
}

function login(harness: Harness): ServerAccount {
  return must(harness.server.accounts[0], 'the login account');
}

void test('with no server a player keeps up to three characters, each with its own save and its own extra keys, and switching swaps them', (): void => {
  const store = createMemoryStore();
  const here: RosterPlace = place(store, null);
  prepareRoster(here);
  store.write(SAVE_KEY, JSON.stringify({ level: 4 }));
  store.write(EXTRA, 'first');
  const random: () => number = counter();
  const second: string = must(addCharacter(here, 'Bright Reed', null, random), 'a second slot');
  assert.equal(levelIn(store), null);
  assert.equal(store.read(EXTRA), null);
  assert.equal(store.read(parkedKey(SAVE_KEY, ROSTER.firstKey)), JSON.stringify({ level: 4 }));
  store.write(SAVE_KEY, JSON.stringify({ level: 2 }));
  must(addCharacter(here, 'Ash Walker', null, random), 'a third slot');
  assert.equal(addCharacter(here, 'One Too Many', null, random), null);
  assert.equal(switchCharacter(here, ROSTER.firstKey), true);
  assert.equal(levelIn(store), 4);
  assert.equal(store.read(EXTRA), 'first');
  assert.equal(store.read(parkedKey(SAVE_KEY, ROSTER.firstKey)), null);
  assert.equal(switchCharacter(here, second), true);
  assert.equal(levelIn(store), 2);
  assert.equal(loadRoster(store).slots.length, 3);
  assert.equal(switchCharacter(here, second), false);
  assert.equal(switchCharacter(here, 'missing'), false);
});

void test('an existing save on a device becomes the first character, untouched', (): void => {
  const store = createMemoryStore();
  store.write(SAVE_KEY, JSON.stringify({ level: 9 }));
  const roster: Roster = prepareRoster(place(store, null));
  assert.deepEqual(roster.slots.map((slot: Slot): string => slot.key), [ROSTER.firstKey]);
  assert.equal(activeSlot(roster).legacy, true);
  assert.equal(levelIn(store), 9);
});

void test('a player with one character loads exactly as before, with no character request', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await played(harness, 3);
  await harness.open().load();
  assert.equal(harness.server.count('GET', '/v1/characters'), 0);
  assert.equal(tokenIn(harness), 'token-1');
});

void test('a second character made in the lobby gets its own server character and its own save; switching back leaves the first one as it was', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await played(harness, 5);
  login(harness).character = 'Grey Heron';
  const id: string = await named(harness, 'Bright Reed');
  must(addCharacter(place(harness.store, URL_A), 'Bright Reed', id, counter()), 'the new slot');
  await played(harness, 2);
  assert.equal(tokenIn(harness), `token-1.${id}`);
  assert.equal(harness.server.characterOf('Bright Reed').save?.level, 2);
  assert.equal(login(harness).save?.level, 5);
  assert.equal(switchCharacter(place(harness.store, URL_A), ROSTER.firstKey), true);
  const back: Backend = harness.open();
  assert.equal((await back.load())?.level, 5);
  assert.equal(tokenIn(harness), `token-1.${login(harness).accountId}`);
  assert.equal(harness.server.characterOf('Bright Reed').save?.level, 2);
});

void test('a character made while the server could not be reached is created on the server at the next load, with a free name', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await played(harness, 5);
  login(harness).character = 'Bright Reed';
  must(addCharacter(place(harness.store, URL_A), 'Bright Reed', null, counter()), 'the new slot');
  await played(harness, 2);
  const made: ServerAccount = harness.server.characterOf('Bright Reed2');
  assert.equal(made.owner, login(harness).accountId);
  assert.equal(made.save?.level, 2);
  assert.equal(activeSlot(loadRoster(harness.store)).name, 'Bright Reed2');
});

void test('a character made before the first one is on the server waits on the device, so it never takes the first one\'s place', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await harness.open().load();
  must(addCharacter(place(harness.store, URL_A), 'Bright Reed', null, counter()), 'the new slot');
  await harness.open().load();
  assert.equal(harness.server.count('POST', '/v1/characters'), 0);
  assert.equal(activeSlot(loadRoster(harness.store)).id, null);
  assert.equal(switchCharacter(place(harness.store, URL_A), ROSTER.firstKey), true);
  await played(harness, 2);
  assert.equal(switchCharacter(place(harness.store, URL_A), activeKeyOf(harness, 'Bright Reed')), true);
  await harness.open().load();
  assert.equal(harness.server.characterOf('Bright Reed').owner, login(harness).accountId);
  assert.equal(login(harness).save?.level, 2);
});

void test('a character made on another device shows up in the list without changing the character in play', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await played(harness, 5);
  await named(harness, 'Elsewhere');
  const before: string = tokenIn(harness);
  const roster: Roster = await reconcileRoster(place(harness.store, URL_A), api(harness), AbortSignal.timeout(1000), 'live');
  assert.deepEqual(
    roster.slots.map((slot: Slot): string | null => slot.name),
    ['Guest 1', 'Elsewhere'],
  );
  assert.equal(tokenIn(harness), before);
  assert.equal(activeSlot(roster).id, login(harness).accountId);
});

void test('a character deleted on another device leaves this device too, and the next one takes its place', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await played(harness, 5);
  login(harness).character = 'Grey Heron';
  const id: string = await named(harness, 'Bright Reed');
  must(addCharacter(place(harness.store, URL_A), 'Bright Reed', id, counter()), 'the new slot');
  await played(harness, 2);
  assert.equal(switchCharacter(place(harness.store, URL_A), ROSTER.firstKey), true);
  await harness.open().load();
  const second: ServerAccount = harness.server.characterOf('Bright Reed');
  second.retired = true;
  second.character = null;
  const roster: Roster = await reconcileRoster(place(harness.store, URL_A), api(harness), AbortSignal.timeout(1000), 'boot');
  assert.deepEqual(
    roster.slots.map((slot: Slot): string | null => slot.name),
    ['Grey Heron'],
  );
});

void test('deleting a character retires it on the server, frees its name and moves play to the next character', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await played(harness, 5);
  login(harness).character = 'Grey Heron';
  const id: string = await named(harness, 'Bright Reed');
  const key: string = must(addCharacter(place(harness.store, URL_A), 'Bright Reed', id, counter()), 'the new slot');
  await played(harness, 2);
  assert.equal(await removeCharacter(place(harness.store, URL_A), key, api(harness), AbortSignal.timeout(1000)), 'removed');
  assert.equal(harness.server.live(login(harness)).length, 1);
  const roster: Roster = loadRoster(harness.store);
  assert.equal(roster.active, ROSTER.firstKey);
  assert.equal(levelIn(harness.store), 5);
  assert.equal((await harness.open().load())?.level, 5);
});

void test('a character with business in the auction house is not deleted', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await played(harness, 5);
  const id: string = await named(harness, 'Bright Reed');
  const key: string = must(addCharacter(place(harness.store, URL_A), 'Bright Reed', id, counter()), 'the new slot');
  harness.server.auctionBusy.add(id);
  assert.equal(await removeCharacter(place(harness.store, URL_A), key, api(harness), AbortSignal.timeout(1000)), 'listed');
  assert.equal(loadRoster(harness.store).slots.length, 2);
  harness.server.goDown();
  assert.equal(await removeCharacter(place(harness.store, URL_A), key, api(harness), AbortSignal.timeout(1000)), 'offline');
  assert.equal(loadRoster(harness.store).slots.length, 2);
});

void test('signing out keeps characters with changes not yet sent and drops the rest from the device', (): void => {
  const store = createMemoryStore();
  const record = { serverUrl: URL_A, accountId: 'account-1', token: 'token-1', revision: 3, updatedAt: null, savedAt: null, pending: false, overwriteCloud: false };
  store.write(SYNC_KEY, serializeSyncRecord(record));
  const here: RosterPlace = place(store, URL_A);
  prepareRoster(here);
  store.write(SAVE_KEY, JSON.stringify({ level: 4 }));
  const random: () => number = counter();
  const quiet: string = must(addCharacter(here, 'Quiet One', 'account-2', random), 'a synced slot');
  store.write(SAVE_KEY, JSON.stringify({ level: 2 }));
  must(addCharacter(here, 'Busy One', null, random), 'an unsent slot');
  store.write(SAVE_KEY, JSON.stringify({ level: 1 }));
  store.write(SYNC_KEY, serializeSyncRecord({ ...record, token: 'token-1.cX', pending: true }));
  assert.equal(switchCharacter(here, ROSTER.firstKey), true);
  store.write(parkedKey(SYNC_KEY, quiet), serializeSyncRecord({ ...record, token: 'token-1.account-2' }));
  store.remove(SYNC_KEY);
  const after: Roster = prepareRoster(here);
  assert.deepEqual(
    after.slots.map((slot: Slot): string | null => slot.name),
    [null, 'Busy One'],
  );
  assert.equal(after.account, 'account-1');
  assert.equal(store.read(parkedKey(SAVE_KEY, quiet)), null);
  assert.deepEqual(prepareRoster(here), after);
  const busy: string = must(after.slots.find((slot: Slot): boolean => slot.name === 'Busy One'), 'the kept slot').key;
  assert.equal(store.read(parkedKey(SYNC_KEY, busy)), null);
  assert.notEqual(store.read(parkedKey(SAVE_KEY, busy)), null);
});

void test('a guest with local characters who signs in to an account with no room keeps the extra ones on this device', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await played(harness, 5);
  const full: ServerAccount = login(harness);
  full.character = 'Owner One';
  await named(harness, 'Owner Two');
  await named(harness, 'Owner Three');
  const store = createMemoryStore();
  const here: RosterPlace = place(store, URL_A);
  prepareRoster(here);
  store.write(SAVE_KEY, JSON.stringify({ level: 1 }));
  must(addCharacter(here, 'Local Two', null, counter()), 'a local slot');
  store.write(SYNC_KEY, serializeSyncRecord({ serverUrl: URL_A, accountId: full.accountId, token: full.token, revision: 0, updatedAt: null, savedAt: null, pending: false, overwriteCloud: false }));
  const roster: Roster = await reconcileRoster(here, createCharactersApi(URL_A, harness.server.fetch), AbortSignal.timeout(1000), 'boot');
  assert.equal(roster.slots.filter((slot: Slot): boolean => slot.id === null).length, 1);
  assert.equal(must(roster.slots.find((slot: Slot): boolean => slot.id === null), 'the overflow').name, 'Local Two');
  assert.equal(harness.server.live(full).length, 3);
});

void test('the lobby summary reads the level and hero from a save and nothing else', (): void => {
  assert.deepEqual(readSummary(JSON.stringify({ level: 3, hero: 'woman', name: 'ignored' })), { name: null, hero: 'woman', level: 3 });
  assert.deepEqual(readSummary('not json'), { name: null, hero: null, level: null });
  assert.deepEqual(readSummary(null), { name: null, hero: null, level: null });
  const store = createMemoryStore();
  prepareRoster(place(store, null));
  const noted: Roster = noteActive(place(store, null), { name: 'Grey Heron', hero: 'man', level: 7 });
  assert.deepEqual(activeSlot(noted), { key: ROSTER.firstKey, id: null, legacy: true, name: 'Grey Heron', hero: 'man', level: 7 });
});

void test('a switch that cannot finish its writes puts every key back, so the save and the character in play never drift apart', (): void => {
  const store = createMemoryStore();
  const here: RosterPlace = place(store, null);
  prepareRoster(here);
  store.write(SAVE_KEY, JSON.stringify({ level: 4 }));
  const second: string = must(addCharacter(here, 'Bright Reed', null, counter()), 'a second slot');
  store.write(SAVE_KEY, JSON.stringify({ level: 2 }));
  const before: ReadonlyMap<string, string> = new Map(store.entries);
  store.failWrites = true;
  assert.equal(switchCharacter(here, ROSTER.firstKey), false);
  store.failWrites = false;
  assert.deepEqual(new Map(store.entries), before);
  assert.equal(loadRoster(store).active, second);
});

void test('deleting the only character also deletes it on the server, so its cloud save never comes back', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await played(harness, 5);
  login(harness).character = 'Grey Heron';
  assert.equal(await removeCharacter(place(harness.store, URL_A), ROSTER.firstKey, api(harness), AbortSignal.timeout(1000)), 'removed');
  assert.equal(login(harness).retired, true);
  assert.equal(levelIn(harness.store), null);
  harness.server.goDown();
  const fresh: Roster = loadRoster(harness.store);
  assert.equal(fresh.slots.length, 1);
  assert.equal(activeSlot(fresh).legacy, true);
});

void test('a delete the server does not route is not mistaken for a character already gone', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await played(harness, 5);
  const id: string = await named(harness, 'Bright Reed');
  const key: string = must(addCharacter(place(harness.store, URL_A), 'Bright Reed', id, counter()), 'the new slot');
  harness.server.plan(404, {}, 'POST', `/v1/characters/${id}/delete`);
  assert.equal(await removeCharacter(place(harness.store, URL_A), key, api(harness), AbortSignal.timeout(1000)), 'offline');
  assert.equal(loadRoster(harness.store).slots.length, 2);
});

void test('signing out and back in to the same account keeps every character on its own server character', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await played(harness, 5);
  login(harness).character = 'Grey Heron';
  const id: string = await named(harness, 'Bright Reed');
  must(addCharacter(place(harness.store, URL_A), 'Bright Reed', id, counter()), 'the new slot');
  await played(harness, 2);
  const record = must(parseSyncRecord(harness.store.read(SYNC_KEY), URL_A), 'the sync record');
  harness.store.remove(SYNC_KEY);
  const out: Roster = prepareRoster(place(harness.store, URL_A));
  assert.equal(activeSlot(out).id, id);
  harness.store.write(SYNC_KEY, serializeSyncRecord({ ...record, token: 'token-1' }));
  await played(harness, 3);
  assert.equal(tokenIn(harness), `token-1.${id}`);
  assert.equal(harness.server.characterOf('Bright Reed').save?.level, 3);
  assert.equal(login(harness).save?.level, 5);
});

void test('a stored roster that cannot be read is kept aside, not lost', (): void => {
  const store = createMemoryStore();
  store.write(ROSTER_KEY, '{"broken": true}');
  prepareRoster(place(store, null));
  assert.equal(store.read(UNREADABLE_ROSTER_KEY), '{"broken": true}');
  store.write(ROSTER_KEY, 'second break');
  loadRoster(store);
  assert.equal(store.read(UNREADABLE_ROSTER_KEY), '{"broken": true}');
});

void test('a player back down to one character on the account default loads with no character request again', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await played(harness, 5);
  login(harness).character = 'Grey Heron';
  const id: string = await named(harness, 'Bright Reed');
  const key: string = must(addCharacter(place(harness.store, URL_A), 'Bright Reed', id, counter()), 'the new slot');
  await played(harness, 2);
  assert.equal(await removeCharacter(place(harness.store, URL_A), key, api(harness), AbortSignal.timeout(1000)), 'removed');
  await harness.open().load();
  const asked: number = harness.server.count('GET', '/v1/characters');
  await harness.open().load();
  assert.equal(harness.server.count('GET', '/v1/characters'), asked);
  assert.equal(tokenIn(harness), 'token-1');
});

void test('a device character whose creation was answered but not kept is matched by name, never made twice', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await played(harness, 5);
  login(harness).character = 'Grey Heron';
  await named(harness, 'Bright Reed');
  must(addCharacter(place(harness.store, URL_A), 'Bright Reed', null, counter()), 'the device slot');
  await harness.open().load();
  assert.equal(harness.server.count('POST', '/v1/characters'), 1);
  assert.equal(harness.server.live(login(harness)).length, 2);
  assert.equal(activeSlot(loadRoster(harness.store)).id, harness.server.characterOf('Bright Reed').accountId);
});

void test('a delete whose local swap cannot be written leaves every key as it was', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await played(harness, 5);
  const id: string = await named(harness, 'Bright Reed');
  const key: string = must(addCharacter(place(harness.store, URL_A), 'Bright Reed', id, counter()), 'the new slot');
  harness.store.write(SAVE_KEY, JSON.stringify({ level: 2 }));
  const before: ReadonlyMap<string, string> = new Map(harness.store.entries);
  const armed: { fail: boolean } = { fail: true };
  const flaky: KeyValueStore = {
    read: (name: string): string | null => harness.store.read(name),
    write: (name: string, value: string): boolean => {
      if (armed.fail) {
        armed.fail = false;
        return false;
      }
      return harness.store.write(name, value);
    },
    remove: (name: string): void => harness.store.remove(name),
  };
  assert.equal(await removeCharacter(place(flaky, URL_A), key, api(harness), AbortSignal.timeout(1000)), 'offline');
  assert.deepEqual(new Map(harness.store.entries), before);
});
