import assert from 'node:assert/strict';
import { test } from 'node:test';
import { content, createHarness, createMemoryStore, makeSave } from '../../test/backend-support.ts';
import type { Harness, ServerAccount } from '../../test/backend-support.ts';
import { must } from '../../test/support.ts';
import type { Backend } from '../backend/backend.ts';
import { createCharactersApi } from '../backend/characters-api.ts';
import { activeSlot } from '../backend/roster.ts';
import { loadRoster, prepareRoster } from '../backend/roster-store.ts';
import type { RosterPlace } from '../backend/roster-store.ts';
import { accountFull, createCharacterDesk, heroNames } from './character-desk.ts';
import type { CharacterDesk, CreateCheck } from './character-desk.ts';
import { STRIP_TEXT } from './character-strip-model.ts';
import { HERO_NAME_KEY } from './hero-name.ts';
import { NAME_MESSAGES } from './lobby-model.ts';

const URL_A: string = 'http://localhost:8787';

function deskOn(harness: Harness): CharacterDesk {
  const place: RosterPlace = { store: harness.store, serverUrl: URL_A, extraKeys: [HERO_NAME_KEY] };
  return createCharacterDesk({ content, place, api: createCharactersApi(URL_A, harness.server.fetch), random: (): number => 0.5 });
}

async function played(harness: Harness, level: number): Promise<Backend> {
  const backend: Backend = harness.open();
  await backend.load();
  backend.save(makeSave(level, 0));
  await harness.timers.advance(1000);
  return backend;
}

function login(harness: Harness): ServerAccount {
  return must(harness.server.accounts[0], 'the login account');
}

void test('hero ids read as their names from the data', (): void => {
  const names = heroNames(content);
  assert.equal(names.name('woman'), 'Woman');
  assert.equal(names.name('nobody'), null);
});

void test('a name is checked on the device first, then on the server, and a refusal comes back in the name step words', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await played(harness, 3);
  login(harness).character = 'Grey Heron';
  const desk: CharacterDesk = deskOn(harness);
  assert.deepEqual(await desk.check('x'), { kind: 'refused', text: NAME_MESSAGES.name_length });
  assert.equal(harness.server.count('POST', '/v1/characters'), 0);
  assert.deepEqual(await desk.check('grey heron'), { kind: 'refused', text: NAME_MESSAGES.name_taken });
  const made: CreateCheck = await desk.check('  Bright   Reed ');
  assert.ok(made.kind === 'ready');
  assert.equal(made.name, 'Bright Reed');
  assert.equal(made.id, harness.server.characterOf('Bright Reed').accountId);
});

void test('opening a new character makes it the one in play, with its name kept for the lobby', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await played(harness, 3);
  const desk: CharacterDesk = deskOn(harness);
  assert.equal(desk.only(), true);
  assert.equal(desk.open('Bright Reed', null), true);
  assert.equal(activeSlot(loadRoster(harness.store)).name, 'Bright Reed');
  assert.equal(harness.store.read(HERO_NAME_KEY), 'Bright Reed');
  assert.equal(desk.only(), false);
  const cards = desk.facts('Bright Reed');
  assert.equal(cards.roster.slots.length, 2);
});

void test('the lobby learns the username and whether the first character is on the server from the live list', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await harness.open().load();
  const desk: CharacterDesk = deskOn(harness);
  assert.equal(desk.facts(null).firstOnServer, true);
  await desk.refresh();
  assert.equal(desk.facts(null).firstOnServer, false);
  await played(harness, 2);
  login(harness).username = 'heron';
  await desk.refresh();
  assert.equal(desk.facts(null).firstOnServer, true);
  assert.equal(desk.username(), 'heron');
});

void test('with no server the desk makes characters on the device and never refuses for the network', async (): Promise<void> => {
  const store = createMemoryStore();
  const place: RosterPlace = { store, serverUrl: null, extraKeys: [] };
  prepareRoster(place);
  const desk: CharacterDesk = createCharacterDesk({ content, place, api: null, random: (): number => 0.25 });
  assert.deepEqual(await desk.check('Bright Reed'), { kind: 'ready', name: 'Bright Reed', id: null });
  assert.equal(desk.open('Bright Reed', null), true);
  assert.equal(desk.open('Ash Walker', null), true);
  assert.deepEqual(await desk.check('One More'), { kind: 'refused', text: STRIP_TEXT.full });
  assert.equal(await desk.remove(), 'removed');
  assert.equal(loadRoster(store).slots.length, 2);
});

void test('an account counts as full once every place it holds has a character', (): void => {
  const roster = { active: 'a', account: 'acc', slots: [{ key: 'a', id: null, legacy: true, name: null, hero: null, level: null }] };
  assert.equal(accountFull(roster, null), false);
  assert.equal(accountFull(roster, { characters: [], max: 1, defaultId: 'acc', username: null }), true);
  assert.equal(accountFull(roster, { characters: [], max: 3, defaultId: 'acc', username: null }), false);
});
