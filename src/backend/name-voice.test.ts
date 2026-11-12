import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMemoryStore } from '../../test/backend-support.ts';
import type { FetchFn } from './api.ts';
import { createNameVoiceClient, NAME_VOICE, readSpokenName } from './name-voice.ts';
import type { SpokenName } from './name-voice.ts';
import { serializeSyncRecord, SYNC_KEY } from './sync-record.ts';

const SERVER: string = 'http://localhost:8787';
const AUDIO: string = btoa('ID3 spoken name');
const offline: FetchFn = (): Promise<Response> => Promise.reject(new Error('offline'));

interface Seen {
  readonly url: string;
  readonly auth: string | null;
}

function answering(seen: Seen[], status: number, body: unknown): FetchFn {
  return (url: string, init: RequestInit): Promise<Response> => {
    seen.push({ url, auth: new Headers(init.headers).get('Authorization') });
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
}

function signedIn(serverUrl: string): ReturnType<typeof createMemoryStore> {
  const store = createMemoryStore();
  store.write(SYNC_KEY, serializeSyncRecord({ serverUrl, accountId: 'a1', token: 'token-1', revision: 1, updatedAt: null, savedAt: null, pending: false, overwriteCloud: false }));
  return store;
}

void test('the spoken name is fetched with the account token from the server that issued it', async (): Promise<void> => {
  const seen: Seen[] = [];
  const client = createNameVoiceClient({ serverUrl: SERVER, store: signedIn(SERVER), fetch: answering(seen, 200, { name: 'Ashen Wren', format: NAME_VOICE.format, audio: AUDIO }) });
  const spoken: SpokenName | null = await client.fetch();
  assert.equal(spoken?.name, 'Ashen Wren');
  assert.equal(new TextDecoder().decode(spoken.audio), 'ID3 spoken name');
  assert.deepEqual(seen, [{ url: `${SERVER}${NAME_VOICE.path}`, auth: 'Bearer token-1' }]);
});

void test('no account, another server, an error or a strange answer gives no voice', async (): Promise<void> => {
  const seen: Seen[] = [];
  assert.equal(await createNameVoiceClient({ serverUrl: SERVER, store: createMemoryStore(), fetch: answering(seen, 200, {}) }).fetch(), null);
  assert.equal(await createNameVoiceClient({ serverUrl: SERVER, store: signedIn('http://other:1'), fetch: answering(seen, 200, {}) }).fetch(), null);
  assert.equal(seen.length, 0);
  assert.equal(await createNameVoiceClient({ serverUrl: SERVER, store: signedIn(SERVER), fetch: answering(seen, 404, { error: { code: 'voice_off' } }) }).fetch(), null);
  assert.equal(await createNameVoiceClient({ serverUrl: SERVER, store: signedIn(SERVER), fetch: offline }).fetch(), null);
  assert.equal(readSpokenName({ name: 'Wren', format: 'audio/wav', audio: AUDIO }), null);
  assert.equal(readSpokenName({ name: 'Wren', format: NAME_VOICE.format, audio: 'not base64' }), null);
  assert.equal(readSpokenName({ name: '', format: NAME_VOICE.format, audio: AUDIO }), null);
  assert.equal(readSpokenName({ name: 'Wren', format: NAME_VOICE.format, audio: 'A'.repeat(NAME_VOICE.maxBase64 + 4) }), null);
});
