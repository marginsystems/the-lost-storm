import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeClock, createFakeServer } from '../../test/backend-support.ts';
import type { FakeServer } from '../../test/backend-support.ts';
import { CHARACTERS_API, createCharactersApi, readServerCharacter, readServerRoster } from './characters-api.ts';
import type { CharactersApi, CreateResult, DeleteResult, ListResult } from './characters-api.ts';

const URL_A: string = 'http://localhost:8787';
const CHARACTER: Readonly<Record<string, unknown>> = { id: 'acc-1', name: 'Grey Heron', hero: 'woman', level: 3, chosen: true };

async function guest(fake: FakeServer): Promise<string> {
  const answer: Response = await fake.fetch(`${URL_A}/v1/guest`, { method: 'POST' });
  const body: unknown = await answer.json();
  const token: unknown = typeof body === 'object' && body !== null && 'token' in body ? body.token : null;
  return typeof token === 'string' ? token : assert.fail('no guest token');
}

function signal(): AbortSignal {
  return AbortSignal.timeout(1000);
}

void test('a listed character and a roster read only their known fields and refuse anything malformed', (): void => {
  assert.deepEqual(readServerCharacter({ ...CHARACTER, secret: 1 }), { id: 'acc-1', name: 'Grey Heron', hero: 'woman', level: 3 });
  assert.equal(readServerCharacter({ ...CHARACTER, hero: null })?.hero, null);
  for (const broken of [null, { ...CHARACTER, id: '' }, { ...CHARACTER, level: 0 }, { ...CHARACTER, hero: 4 }, { ...CHARACTER, name: 'x'.repeat(CHARACTERS_API.textChars + 1) }]) assert.equal(readServerCharacter(broken), null);
  const roster: unknown = { characters: [CHARACTER], max: 3, default: 'acc-1', username: 'heron' };
  assert.deepEqual(readServerRoster(roster), { characters: [{ id: 'acc-1', name: 'Grey Heron', hero: 'woman', level: 3 }], max: 3, defaultId: 'acc-1', username: 'heron' });
  assert.equal(readServerRoster({ characters: [CHARACTER, { id: '' }], max: 3, default: 'acc-1', username: null }), null);
  assert.equal(readServerRoster({ characters: [], max: 0, default: 'acc-1', username: null }), null);
  assert.equal(readServerRoster({ characters: [], max: 3, default: null, username: null }), null);
});

void test('a guest lists, creates and deletes characters, and the server refusals come back as reasons', async (): Promise<void> => {
  const fake: FakeServer = createFakeServer(createFakeClock());
  const api: CharactersApi = createCharactersApi(URL_A, fake.fetch);
  const token: string = await guest(fake);
  const first: CreateResult = await api.create(token, 'Grey Heron', signal());
  assert.equal(first.kind, 'ok');
  assert.deepEqual(await api.create(token, 'grey heron', signal()), { kind: 'invalid', reason: 'name_taken' });
  assert.deepEqual(await api.create(token, 'no', signal()), { kind: 'invalid', reason: 'name_length' });
  const second: CreateResult = await api.create(token, 'Bright Reed', signal());
  await api.create(token, 'Ash Walker', signal());
  assert.deepEqual(await api.create(token, 'One More', signal()), { kind: 'invalid', reason: 'character_limit' });
  const listed: ListResult = await api.list(token, signal());
  assert.equal(listed.kind === 'ok' ? listed.roster.characters.length : 0, 3);
  assert.equal(listed.kind === 'ok' ? listed.roster.username : null, 'Grey Heron');
  const id: string = second.kind === 'ok' ? second.character.id : assert.fail('no second character');
  fake.auctionBusy.add(id);
  assert.deepEqual(await api.remove(token, id, signal()), { kind: 'listed' });
  fake.auctionBusy.delete(id);
  assert.deepEqual(await api.remove(token, id, signal()), { kind: 'ok' });
  const gone: DeleteResult = await api.remove(token, id, signal());
  assert.deepEqual(gone, { kind: 'gone' });
});

void test('a list that cannot reach the server is a failure the caller can wait out', async (): Promise<void> => {
  const fake: FakeServer = createFakeServer(createFakeClock());
  const api: CharactersApi = createCharactersApi(URL_A, fake.fetch);
  const token: string = await guest(fake);
  fake.goDown();
  const listed: ListResult = await api.list(token, signal());
  assert.notEqual(listed.kind, 'ok');
});
