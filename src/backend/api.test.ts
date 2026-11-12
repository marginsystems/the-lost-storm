import assert from 'node:assert/strict';
import { test } from 'node:test';
import { content, makeSave } from '../../test/backend-support.ts';
import { must } from '../../test/support.ts';
import { createApi, readCloudState, readProfile, readProviders, readSession } from './api.ts';
import type { Api, FetchFn } from './api.ts';

const SIGNAL: AbortSignal = new AbortController().signal;

function api(respond: (url: string, init: RequestInit) => Response | Error): { readonly client: Api; readonly seen: { url: string; init: RequestInit }[] } {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetchFn: FetchFn = (url: string, init: RequestInit): Promise<Response> => {
    seen.push({ url, init });
    const outcome: Response | Error = respond(url, init);
    return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
  };
  return { client: createApi('http://localhost:8787', fetchFn, content), seen };
}

function reply(status: number, body: unknown, headers: Readonly<Record<string, string>> = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
}

interface Sent {
  readonly url: string;
  readonly init: RequestInit;
}

function sent(seen: readonly Sent[]): Sent {
  return must(seen[0], 'the request');
}

function bodyOf(init: RequestInit): unknown {
  if (typeof init.body !== 'string') return null;
  const parsed: unknown = JSON.parse(init.body);
  return parsed;
}

async function wait(header: string | null): Promise<unknown> {
  const { client } = api((): Response => reply(429, {}, header === null ? {} : { 'Retry-After': header }));
  return client.writeSave('tok', SAVE, 0, SIGNAL);
}

const SAVE = makeSave(3, 12);
const COPY = { save: SAVE, revision: 2, updatedAt: '2026-11-11T10:00:00.000Z' };

void test('a guest account is created with a POST and no token', async (): Promise<void> => {
  const { client, seen } = api((): Response => reply(201, { accountId: 'a', token: 't' }));
  assert.deepEqual(await client.createGuest(SIGNAL), { kind: 'ok', account: { accountId: 'a', token: 't' } });
  assert.equal(sent(seen).url, 'http://localhost:8787/v1/guest');
  assert.equal(sent(seen).init.method, 'POST');
  assert.equal(new Headers(sent(seen).init.headers).get('authorization'), null);
});

void test('reading the save sends the token and understands a copy and an empty account', async (): Promise<void> => {
  const full = api((): Response => reply(200, COPY));
  assert.deepEqual(await full.client.readSave('tok', SIGNAL), { kind: 'ok', state: COPY });
  assert.equal(new Headers(sent(full.seen).init.headers).get('authorization'), 'Bearer tok');
  const empty = api((): Response => reply(200, { save: null, revision: 0, updatedAt: null }));
  assert.deepEqual(await empty.client.readSave('tok', SIGNAL), { kind: 'ok', state: { save: null, revision: 0, updatedAt: null } });
});

void test('writing sends the save and the base revision and returns the stored copy', async (): Promise<void> => {
  const { client, seen } = api((): Response => reply(200, COPY));
  assert.deepEqual(await client.writeSave('tok', SAVE, 1, SIGNAL), { kind: 'ok', copy: COPY });
  assert.equal(sent(seen).init.method, 'PUT');
  assert.deepEqual(bodyOf(sent(seen).init), { save: SAVE, baseRevision: 1 });
  assert.equal(sent(seen).init.keepalive, true);
});

void test('keepalive is only asked for when the body is small enough for the browser to allow it', async (): Promise<void> => {
  const small = api((): Response => reply(200, COPY));
  await small.client.writeSave('tok', SAVE, 1, SIGNAL);
  assert.equal(sent(small.seen).init.keepalive, true);
  const large = api((): Response => reply(200, COPY));
  await large.client.writeSave('tok', { ...SAVE, allocated: Array.from({ length: 8000 }, (_: unknown, index: number): string => `node_${index}`) }, 1, SIGNAL);
  assert.equal(sent(large.seen).init.keepalive, false);
});

void test('a 409 hands back the current copy, read through the game rules', async (): Promise<void> => {
  const { client } = api((): Response => reply(409, { error: { code: 'revision_conflict', message: 'x' }, current: COPY }));
  assert.deepEqual(await client.writeSave('tok', SAVE, 1, SIGNAL), { kind: 'conflict', current: COPY });
  const broken = api((): Response => reply(409, { error: {}, current: { ...COPY, save: { version: 99 } } }));
  assert.deepEqual(await broken.client.writeSave('tok', SAVE, 1, SIGNAL), { kind: 'refused', status: 409 });
});

void test('failures are told apart: unauthorized, refused, and worth retrying', async (): Promise<void> => {
  const answers: readonly [number, unknown][] = [
    [401, { error: {} }],
    [422, { error: {} }],
    [400, { error: {} }],
    [413, { error: {} }],
    [404, { error: {} }],
    [429, { error: {} }],
    [500, { error: {} }],
    [503, 'bad gateway'],
    [408, ''],
  ];
  const kinds: string[] = await Promise.all(
    answers.map(async ([status, body]: readonly [number, unknown]): Promise<string> => {
      const { client } = api((): Response => reply(status, body));
      return (await client.writeSave('tok', SAVE, 0, SIGNAL)).kind;
    }),
  );
  assert.deepEqual(kinds, ['unauthorized', 'refused', 'refused', 'refused', 'refused', 'retry', 'retry', 'retry', 'retry']);
});

void test('Retry-After on a 429 is read in seconds and capped', async (): Promise<void> => {
  assert.deepEqual(await wait('7'), { kind: 'retry', afterMs: 7000 });
  assert.deepEqual(await wait('99999'), { kind: 'retry', afterMs: 120_000 });
  assert.deepEqual(await wait('soon'), { kind: 'retry', afterMs: null });
  assert.deepEqual(await wait('0'), { kind: 'retry', afterMs: null });
  assert.deepEqual(await wait(''), { kind: 'retry', afterMs: null });
  assert.deepEqual(await wait('-3'), { kind: 'retry', afterMs: null });
  assert.deepEqual(await wait(null), { kind: 'retry', afterMs: null });
});

void test('a network error is a retry, and so is a body that cannot be read', async (): Promise<void> => {
  const down = api((): Error => new TypeError('network down'));
  assert.deepEqual(await down.client.readSave('tok', SIGNAL), { kind: 'retry', afterMs: null });
  assert.deepEqual(await down.client.createGuest(SIGNAL), { kind: 'retry', afterMs: null });
  assert.deepEqual(await down.client.writeSave('tok', SAVE, 0, SIGNAL), { kind: 'retry', afterMs: null });
});

void test('a success the client cannot understand is refused, never trusted', async (): Promise<void> => {
  const bodies: readonly unknown[] = [
    'not json',
    [],
    { save: { version: 99 }, revision: 1, updatedAt: '2026-11-11T10:00:00.000Z' },
    { save: SAVE, revision: -1, updatedAt: '2026-11-11T10:00:00.000Z' },
    { save: SAVE, revision: 1.5, updatedAt: '2026-11-11T10:00:00.000Z' },
    { save: SAVE, revision: 1 },
    { revision: 1 },
  ];
  const kinds: string[] = await Promise.all(
    bodies.map(async (body: unknown): Promise<string> => (await api((): Response => reply(200, body)).client.readSave('tok', SIGNAL)).kind),
  );
  assert.deepEqual(kinds, Array.from({ length: bodies.length }, (): string => 'refused'));
  const guest = api((): Response => reply(201, { accountId: 'a' }));
  assert.deepEqual(await guest.client.createGuest(SIGNAL), { kind: 'refused', status: 201 });
  const empty = api((): Response => reply(200, { save: null, revision: 0, updatedAt: null }));
  assert.deepEqual(await empty.client.writeSave('tok', SAVE, 0, SIGNAL), { kind: 'refused', status: 200 });
});

void test('a copy is read through readSave, so the game rules repair what they repair', (): void => {
  const repaired = readCloudState(content, { save: { ...SAVE, level: 100000 }, revision: 2, updatedAt: 'x' });
  assert.equal(repaired?.save?.level, content.player.xp.maxLevel);
});

void test('the providers call needs no token and reads the Google client id or its absence', async (): Promise<void> => {
  const offered = api((): Response => reply(200, { google: { clientId: 'c.apps.googleusercontent.com' } }));
  assert.deepEqual(await offered.client.providers(SIGNAL), { kind: 'ok', providers: { googleClientId: 'c.apps.googleusercontent.com', emailSiteKey: null } });
  assert.equal(sent(offered.seen).url, 'http://localhost:8787/v1/auth/providers');
  assert.equal(new Headers(sent(offered.seen).init.headers).get('authorization'), null);
  const none = api((): Response => reply(200, { google: null }));
  assert.deepEqual(await none.client.providers(SIGNAL), { kind: 'ok', providers: { googleClientId: null, emailSiteKey: null } });
  assert.deepEqual(readProviders({ google: null, email: { turnstileSiteKey: '0x4AAA' } }), { googleClientId: null, emailSiteKey: '0x4AAA' });
  for (const body of [{}, { google: {} }, { google: { clientId: 7 } }, { google: 'yes' }, 'text', { google: null, email: {} }, { google: null, email: 'yes' }]) {
    assert.deepEqual(readProviders(body), null);
  }
});

void test('the profile call sends the token and accepts only a known kind', async (): Promise<void> => {
  const signedIn = api((): Response => reply(200, { accountId: 'a', kind: 'google', name: 'Ada', createdAt: 'x' }));
  assert.deepEqual(await signedIn.client.profile('tok', SIGNAL), { kind: 'ok', profile: { accountId: 'a', kind: 'google', name: 'Ada' } });
  assert.equal(sent(signedIn.seen).url, 'http://localhost:8787/v1/me');
  assert.equal(new Headers(sent(signedIn.seen).init.headers).get('authorization'), 'Bearer tok');
  assert.deepEqual(readProfile({ accountId: 'a', kind: 'guest' }), { accountId: 'a', kind: 'guest', name: null });
  assert.deepEqual(readProfile({ accountId: 'a', kind: 'email', name: 'a•••@example.com' }), { accountId: 'a', kind: 'email', name: 'a•••@example.com' });
  for (const body of [{ accountId: 'a', kind: 'admin', name: null }, { kind: 'guest', name: null }, { accountId: 'a', kind: 'guest', name: 5 }, null]) {
    assert.deepEqual(readProfile(body), null);
  }
  const gone = api((): Response => reply(401, {}));
  assert.deepEqual(await gone.client.profile('tok', SIGNAL), { kind: 'unauthorized' });
});

void test('the email start call posts the address and the bot token and reads the cooldown', async (): Promise<void> => {
  const sentCode = api((): Response => reply(200, { sent: true, expiresInSeconds: 600, resendAfterSeconds: 60 }));
  assert.deepEqual(await sentCode.client.emailStart('tok', 'ada@example.com', 'ts', SIGNAL), { kind: 'sent', resendAfterMs: 60_000 });
  assert.equal(sent(sentCode.seen).url, 'http://localhost:8787/v1/auth/email/start');
  assert.equal(sent(sentCode.seen).init.method, 'POST');
  assert.equal(new Headers(sent(sentCode.seen).init.headers).get('authorization'), 'Bearer tok');
  assert.deepEqual(bodyOf(sent(sentCode.seen).init), { email: 'ada@example.com', turnstileToken: 'ts' });
  const limited = api((): Response => reply(429, { error: { code: 'rate_limited', message: 'm' } }, { 'Retry-After': '30' }));
  assert.deepEqual(await limited.client.emailStart('tok', 'a@b.co', 'ts', SIGNAL), { kind: 'refused', status: 429, code: 'rate_limited', retryAfterMs: 30_000 });
  const odd = api((): Response => reply(200, { sent: 'yes' }));
  assert.deepEqual(await odd.client.emailStart('tok', 'a@b.co', 'ts', SIGNAL), { kind: 'refused', status: 200, code: 'unknown', retryAfterMs: null });
  const down = api((): Error => new TypeError('down'));
  assert.deepEqual(await down.client.emailStart('tok', 'a@b.co', 'ts', SIGNAL), { kind: 'unreachable' });
});

void test('the email verify call reads a session, a wrong code with the tries left, or the refusal code', async (): Promise<void> => {
  const ok = api((): Response => reply(200, { accountId: 'a', token: 's', outcome: 'linked', name: 'a•••@example.com' }));
  assert.deepEqual(await ok.client.emailVerify('tok', 'ada@example.com', '042917', SIGNAL), { kind: 'ok', session: { accountId: 'a', token: 's', outcome: 'linked', name: 'a•••@example.com' } });
  assert.equal(sent(ok.seen).url, 'http://localhost:8787/v1/auth/email/verify');
  assert.deepEqual(bodyOf(sent(ok.seen).init), { email: 'ada@example.com', code: '042917' });
  const wrong = api((): Response => reply(422, { error: { code: 'wrong_code', message: 'm' }, attemptsLeft: 3 }));
  assert.deepEqual(await wrong.client.emailVerify('tok', 'a@b.co', '000000', SIGNAL), { kind: 'wrong', attemptsLeft: 3 });
  const expired = api((): Response => reply(410, { error: { code: 'code_expired', message: 'm' } }));
  assert.deepEqual(await expired.client.emailVerify('tok', 'a@b.co', '000000', SIGNAL), { kind: 'refused', status: 410, code: 'code_expired', retryAfterMs: null });
});

void test('the nonce call is a POST with the token and refuses an answer without a nonce', async (): Promise<void> => {
  const issued = api((): Response => reply(200, { nonce: 'n-1' }));
  assert.deepEqual(await issued.client.googleNonce('tok', SIGNAL), { kind: 'ok', nonce: 'n-1' });
  assert.equal(sent(issued.seen).url, 'http://localhost:8787/v1/auth/google/nonce');
  assert.equal(sent(issued.seen).init.method, 'POST');
  assert.equal(new Headers(sent(issued.seen).init.headers).get('authorization'), 'Bearer tok');
  const empty = api((): Response => reply(200, { nonce: '' }));
  assert.deepEqual(await empty.client.googleNonce('tok', SIGNAL), { kind: 'refused', status: 200 });
  const off = api((): Response => reply(503, {}));
  assert.deepEqual(await off.client.googleNonce('tok', SIGNAL), { kind: 'retry', afterMs: null });
});

void test('the sign-in call posts the credential with the stored token and reads the session', async (): Promise<void> => {
  const ok = api((): Response => reply(200, { accountId: 'a', token: 's', outcome: 'linked', name: null }));
  assert.deepEqual(await ok.client.googleSignIn('tok', 'cred', SIGNAL), { kind: 'ok', session: { accountId: 'a', token: 's', outcome: 'linked', name: null } });
  assert.equal(sent(ok.seen).url, 'http://localhost:8787/v1/auth/google');
  assert.equal(sent(ok.seen).init.method, 'POST');
  assert.equal(new Headers(sent(ok.seen).init.headers).get('authorization'), 'Bearer tok');
  assert.deepEqual(bodyOf(sent(ok.seen).init), { credential: 'cred' });
  for (const body of [{ accountId: 'a', token: 's', outcome: 'merged', name: null }, { accountId: 'a', outcome: 'linked' }, { token: 's', outcome: 'existing' }, { accountId: 'a', token: '', outcome: 'linked' }]) {
    assert.deepEqual(readSession(body), null);
  }
  const refused = api((): Response => reply(401, { error: { code: 'invalid_google_token' } }));
  assert.deepEqual(await refused.client.googleSignIn('tok', 'cred', SIGNAL), { kind: 'unauthorized' });
  const conflict = api((): Response => reply(409, {}));
  assert.deepEqual(await conflict.client.googleSignIn('tok', 'cred', SIGNAL), { kind: 'refused', status: 409 });
});

void test('the sign-out call is a POST with the token and a network failure is a retry', async (): Promise<void> => {
  const ok = api((): Response => reply(200, { signedOut: true }));
  assert.deepEqual(await ok.client.signOut('tok', SIGNAL), { kind: 'ok' });
  assert.equal(sent(ok.seen).url, 'http://localhost:8787/v1/signout');
  assert.equal(sent(ok.seen).init.method, 'POST');
  assert.equal(new Headers(sent(ok.seen).init.headers).get('authorization'), 'Bearer tok');
  const down = api((): Error => new TypeError('offline'));
  assert.deepEqual(await down.client.signOut('tok', SIGNAL), { kind: 'retry', afterMs: null });
});
