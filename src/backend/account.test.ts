import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BAD_TURNSTILE_TOKEN, content, createHarness, createSecondBrowser, makeSave, settle, storedLocal } from '../../test/backend-support.ts';
import type { Harness, ServerAccount } from '../../test/backend-support.ts';
import { must } from '../../test/support.ts';
import type { SaveData } from '../../sim/save.ts';
import { createAccountService, emailStartResult, recordAfterSignIn } from './account.ts';
import type { AccountService, AccountState, EmailVerifyResult, SignInResult } from './account.ts';
import { createApi } from './api.ts';
import type { Session } from './api.ts';
import type { Backend } from './backend.ts';
import { SAVE_KEY } from './local.ts';
import { parseSyncRecord, SYNC_KEY } from './sync-record.ts';
import type { SyncRecord } from './sync-record.ts';

const URL_A: string = 'http://localhost:8787';
const CLIENT_ID: string = 'client-1.apps.googleusercontent.com';

interface Browser {
  readonly harness: Harness;
  readonly service: AccountService;
}

function serviceFor(harness: Harness, url: string = URL_A): AccountService {
  return createAccountService({ serverUrl: url, api: createApi(url, harness.server.fetch, content), store: harness.store });
}

async function browser(save: SaveData | null = null): Promise<Browser> {
  const harness: Harness = createHarness();
  harness.server.offerGoogle(CLIENT_ID);
  const backend: Backend = harness.open();
  await backend.load();
  if (save !== null) {
    backend.save(save);
    await harness.timers.advance(1000);
  }
  return { harness, service: serviceFor(harness) };
}

function record(harness: Harness): SyncRecord {
  return must(parseSyncRecord(harness.store.read(SYNC_KEY), URL_A), 'the sync record');
}

function credential(state: AccountState, subject: string, name: string = 'Ada'): string {
  assert.ok(state.kind === 'guest');
  return `google|${subject}|${name}`;
}

async function signInAs(service: AccountService, subject: string): Promise<SignInResult> {
  return service.signIn(credential(await service.load(), subject));
}

function owner(harness: Harness, index: number): ServerAccount {
  return must(harness.server.accounts[index], 'the server account');
}

void test('a guest on a server that offers Google gets the client id', async (): Promise<void> => {
  const { service } = await browser();
  assert.deepEqual(await service.load(), { kind: 'guest', google: { clientId: CLIENT_ID }, email: null });
});

void test('nothing is offered without a stored account, on a server without sign-in, or when the server is unreachable', async (): Promise<void> => {
  const empty: Harness = createHarness();
  empty.server.offerGoogle(CLIENT_ID);
  assert.deepEqual(await serviceFor(empty).load(), { kind: 'unreachable' });
  assert.equal(empty.server.requests.length, 0);

  const plain: Harness = createHarness();
  await plain.open().load();
  assert.deepEqual(await serviceFor(plain).load(), { kind: 'hidden' });

  const { harness, service } = await browser();
  harness.server.goDown();
  assert.deepEqual(await service.load(), { kind: 'unreachable' });
});

void test('a record for another server is never used', async (): Promise<void> => {
  const { harness } = await browser();
  const before: number = harness.server.requests.length;
  assert.deepEqual(await serviceFor(harness, 'http://localhost:9999').load(), { kind: 'unreachable' });
  assert.equal(harness.server.requests.length, before);
});

void test('signing in as a guest keeps the account and the save and swaps only the token', async (): Promise<void> => {
  const { harness, service } = await browser(makeSave(4, 10));
  const before: SyncRecord = record(harness);
  assert.deepEqual(await signInAs(service, 'ada'), { kind: 'reload' });
  const after: SyncRecord = record(harness);
  assert.deepEqual(after, { ...before, token: 'session-1' });
  assert.equal(owner(harness, 0).google, 'ada');
  assert.notEqual(harness.store.read(SAVE_KEY), null);
  assert.deepEqual(await service.load(), { kind: 'signed-in', method: 'google', name: 'Ada' });
  const reloaded: SaveData | null = await harness.open().load();
  assert.equal(reloaded?.level, 4);
  assert.equal(harness.server.accounts.length, 1);
});

void test('the sign-in request carries the stored token and the access token from Google', async (): Promise<void> => {
  const { harness, service } = await browser();
  const guestToken: string = record(harness).token;
  await signInAs(service, 'ada');
  const request = must(
    harness.server.requests.find((entry): boolean => entry.path === '/v1/auth/google'),
    'the sign-in request',
  );
  assert.equal(request.token, guestToken);
  assert.deepEqual(request.body, { accessToken: 'google|ada|Ada' });
});

void test('a switch to another account starts a clean record and carries over only whether this browser has unsynced progress', (): void => {
  const guest: SyncRecord = { serverUrl: URL_A, accountId: 'guest-2', token: 'token-guest-2', revision: 7, updatedAt: '2026-11-11T00:00:00.000Z', savedAt: '2026-11-11T00:00:00.000Z', pending: true, overwriteCloud: true };
  const session: Session = { accountId: 'account-1', token: 'session-9', outcome: 'existing', name: 'Ada' };
  assert.deepEqual(recordAfterSignIn({ ...guest, pending: false }, session), { serverUrl: URL_A, accountId: 'account-1', token: 'session-9', revision: 0, updatedAt: null, savedAt: null, pending: false, overwriteCloud: false });
  assert.deepEqual(recordAfterSignIn(guest, session), { serverUrl: URL_A, accountId: 'account-1', token: 'session-9', revision: 0, updatedAt: null, savedAt: guest.savedAt, pending: true, overwriteCloud: false });
  assert.deepEqual(recordAfterSignIn(guest, { ...session, accountId: 'guest-2', outcome: 'linked' }), { ...guest, token: 'session-9' });
});

void test('a browser that switches to an account with a cloud save loads that save and keeps it', async (): Promise<void> => {
  const { harness, service } = await browser(makeSave(9, 50));
  await signInAs(service, 'ada');
  const second: Harness = createSecondBrowser(harness);
  const secondBackend: Backend = second.open();
  await secondBackend.load();
  secondBackend.save(makeSave(2, 5));
  await second.timers.advance(1000);
  assert.equal(second.server.accounts.length, 2);
  const secondService: AccountService = serviceFor(second);
  assert.deepEqual(await signInAs(secondService, 'ada'), { kind: 'reload' });
  const switched: SyncRecord = record(second);
  assert.equal(switched.accountId, owner(harness, 0).accountId);
  assert.deepEqual([switched.revision, switched.pending, switched.overwriteCloud, switched.savedAt], [0, false, false, null]);
  const loaded: SaveData | null = await second.open().load();
  assert.equal(loaded?.level, 9);
  await settle();
  assert.equal(owner(harness, 0).save?.level, 9);
  assert.equal(owner(harness, 1).save?.level, 2);
  assert.deepEqual(await secondService.load(), { kind: 'signed-in', method: 'google', name: 'Ada' });
});

void test('a browser that switches to an account with no cloud save uploads its own save to it', async (): Promise<void> => {
  const { harness, service } = await browser();
  await signInAs(service, 'ada');
  const second: Harness = createSecondBrowser(harness);
  const secondBackend: Backend = second.open();
  await secondBackend.load();
  secondBackend.save(makeSave(3, 1));
  await second.timers.advance(1000);
  await signInAs(serviceFor(second), 'ada');
  const loaded: SaveData | null = await second.open().load();
  assert.equal(loaded?.level, 3);
  await second.timers.advance(0);
  assert.equal(owner(harness, 0).save?.level, 3);
});

void test('a refused token changes nothing and leaves the guest able to try again', async (): Promise<void> => {
  const { harness, service } = await browser(makeSave(4, 10));
  const before: SyncRecord = record(harness);
  const result: SignInResult = await service.signIn('not-google|ada|Ada');
  assert.deepEqual(result, { kind: 'failed', state: { kind: 'guest', google: { clientId: CLIENT_ID }, email: null } });
  assert.deepEqual(record(harness), before);
  assert.deepEqual(await service.signIn(credential(result.kind === 'failed' ? result.state : { kind: 'hidden' }, 'ada')), { kind: 'reload' });
});

void test('a sign-in to another account that cannot be stored is a failure, not a reload', async (): Promise<void> => {
  const first: Browser = await browser();
  assert.deepEqual(await signInAs(first.service, 'ada'), { kind: 'reload' });
  const harness: Harness = createSecondBrowser(first.harness);
  await harness.open().load();
  const service: AccountService = serviceFor(harness);
  const state: AccountState = await service.load();
  harness.store.failWrites = true;
  const result: SignInResult = await service.signIn(credential(state, 'ada'));
  assert.equal(result.kind, 'failed');
});

void test('a sign-in whose answer never arrives still signs this browser in, because the server linked the account it holds', async (): Promise<void> => {
  const { harness, service } = await browser(makeSave(4, 10));
  const before: SyncRecord = record(harness);
  const state: AccountState = await service.load();
  harness.server.loseNextAnswer('POST', '/v1/auth/google');
  assert.deepEqual(await service.signIn(credential(state, 'ada')), { kind: 'reload' });
  assert.deepEqual(record(harness), before);
  assert.equal(owner(harness, 0).google, 'ada');
  assert.deepEqual(await service.load(), { kind: 'signed-in', method: 'google', name: 'Ada' });
  const reloaded: SaveData | null = await harness.open().load();
  assert.equal(reloaded?.level, 4);
  assert.equal(harness.server.accounts.length, 1);
});

void test('a sign-in whose answer is lost while the server stays out of reach is a failure that is asked about again', async (): Promise<void> => {
  const { harness, service } = await browser();
  const state: AccountState = await service.load();
  harness.server.loseNextAnswer('POST', '/v1/auth/google');
  harness.server.plan(503, {}, 'GET');
  assert.deepEqual(await service.signIn(credential(state, 'ada')), { kind: 'failed', state: { kind: 'unreachable' } });
  assert.deepEqual(await service.load(), { kind: 'signed-in', method: 'google', name: 'Ada' });
});

void test('a lost answer for a sign-in to another account leaves this browser a guest who can try again', async (): Promise<void> => {
  const first: Browser = await browser();
  assert.deepEqual(await signInAs(first.service, 'ada'), { kind: 'reload' });
  const harness: Harness = createSecondBrowser(first.harness);
  await harness.open().load();
  const service: AccountService = serviceFor(harness);
  const state: AccountState = await service.load();
  harness.server.loseNextAnswer('POST', '/v1/auth/google');
  const result: SignInResult = await service.signIn(credential(state, 'ada'));
  assert.ok(result.kind === 'failed' && result.state.kind === 'guest');
  assert.deepEqual(await service.signIn(credential(result.state, 'ada')), { kind: 'reload' });
  assert.deepEqual(await service.load(), { kind: 'signed-in', method: 'google', name: 'Ada' });
});

void test('a browser left on its guest token after a lost answer can sign out, and that token stops working', async (): Promise<void> => {
  const { harness, service } = await browser();
  const state: AccountState = await service.load();
  harness.server.loseNextAnswer('POST', '/v1/auth/google');
  assert.deepEqual(await service.signIn(credential(state, 'ada')), { kind: 'reload' });
  const token: string = record(harness).token;
  assert.equal(await service.signOut(), 'reload');
  assert.equal(owner(harness, 0).guestRetired, true);
  assert.equal(harness.store.read(SYNC_KEY), null);
  assert.equal(token, owner(harness, 0).token);
});

void test('signing out ends the session, forgets the token and the local save, and the next start is a new guest', async (): Promise<void> => {
  const { harness, service } = await browser(makeSave(4, 10));
  await signInAs(service, 'ada');
  const session: string = record(harness).token;
  assert.equal(await service.signOut(), 'reload');
  assert.equal(harness.store.read(SYNC_KEY), null);
  assert.equal(harness.store.read(SAVE_KEY), null);
  assert.ok(!owner(harness, 0).sessions.includes(session));
  assert.equal(await harness.open().load(), null);
  assert.equal(harness.server.accounts.length, 2);
  assert.equal(owner(harness, 0).save?.level, 4);
  assert.equal((await serviceFor(harness).load()).kind, 'guest');
});

void test('signing out is refused while this browser has progress the cloud has not got', async (): Promise<void> => {
  const { harness, service } = await browser(makeSave(4, 10));
  await signInAs(service, 'ada');
  const held: SyncRecord = record(harness);
  harness.store.write(SYNC_KEY, JSON.stringify({ ...held, pending: true }));
  assert.equal(await service.signOut(), 'unsynced');
  harness.store.write(SYNC_KEY, JSON.stringify({ ...held, overwriteCloud: true }));
  assert.equal(await service.signOut(), 'unsynced');
  assert.notEqual(harness.store.read(SAVE_KEY), null);
  assert.equal(harness.server.count('POST', '/v1/signout'), 0);
});

void test('signing out still clears this browser when the server cannot be reached', async (): Promise<void> => {
  const { harness, service } = await browser(makeSave(4, 10));
  await signInAs(service, 'ada');
  harness.server.goDown();
  assert.equal(await service.signOut(), 'reload');
  assert.equal(harness.store.read(SYNC_KEY), null);
});

void test('a guest with unsynced progress who switches accounts keeps it when it is further along than the cloud save', async (): Promise<void> => {
  const { harness, service } = await browser(makeSave(3, 0));
  await signInAs(service, 'ada');
  const second: Harness = createSecondBrowser(harness);
  const secondBackend: Backend = second.open();
  await secondBackend.load();
  harness.server.goDown();
  secondBackend.save(makeSave(8, 20));
  await second.timers.advance(1000);
  harness.server.comeUp();
  assert.equal(record(second).pending, true);
  assert.deepEqual(await signInAs(serviceFor(second), 'ada'), { kind: 'reload' });
  assert.equal(record(second).pending, true);
  const loaded: SaveData | null = await second.open().load();
  assert.equal(loaded?.level, 8);
  await second.timers.advance(0);
  assert.equal(owner(harness, 0).save?.level, 8);
});

void test('a guest with unsynced progress who switches to an account that is further along gets the account save', async (): Promise<void> => {
  const { harness, service } = await browser(makeSave(9, 0));
  await signInAs(service, 'ada');
  const second: Harness = createSecondBrowser(harness);
  const secondBackend: Backend = second.open();
  await secondBackend.load();
  harness.server.goDown();
  secondBackend.save(makeSave(2, 0));
  await second.timers.advance(1000);
  harness.server.comeUp();
  await signInAs(serviceFor(second), 'ada');
  const loaded: SaveData | null = await second.open().load();
  assert.equal(loaded?.level, 9);
  assert.equal(owner(harness, 0).save?.level, 9);
});

void test('a save made while the sign-in request is in flight is not undone by the answer', async (): Promise<void> => {
  const { harness, service } = await browser(makeSave(4, 10));
  const state: AccountState = await service.load();
  const release: () => void = harness.server.holdNext();
  const signing: Promise<SignInResult> = service.signIn(credential(state, 'ada'));
  const during: SyncRecord = record(harness);
  harness.store.write(SYNC_KEY, JSON.stringify({ ...during, revision: during.revision + 1, pending: true }));
  release();
  assert.deepEqual(await signing, { kind: 'reload' });
  const after: SyncRecord = record(harness);
  assert.deepEqual([after.revision, after.pending, after.token], [during.revision + 1, true, 'session-1']);
});

void test('progress saved while the sign-out request is in flight is kept, and the sign-out still finishes', async (): Promise<void> => {
  const { harness, service } = await browser(makeSave(4, 10));
  await signInAs(service, 'ada');
  const session: string = record(harness).token;
  const release: () => void = harness.server.holdNext();
  const leaving: Promise<string> = service.signOut();
  harness.store.write(SYNC_KEY, JSON.stringify({ ...record(harness), pending: true }));
  harness.store.write(SAVE_KEY, storedLocal(makeSave(6, 0)));
  release();
  assert.equal(await leaving, 'reload');
  assert.equal(harness.store.read(SYNC_KEY), null);
  assert.ok(!owner(harness, 0).sessions.includes(session));
  const loaded: SaveData | null = await harness.open().load();
  assert.equal(loaded?.level, 6);
  await harness.timers.advance(0);
  assert.equal(harness.server.accounts.length, 2);
  assert.equal(owner(harness, 1).save?.level, 6);
  assert.equal(owner(harness, 0).save?.level, 4);
});

const SITE_KEY: string = '0x4AAAAAAexample';
const ADA_EMAIL: string = 'ada@example.com';

async function emailBrowser(google: boolean = false, save: SaveData | null = null): Promise<Browser> {
  const made: Browser = await browser(save);
  made.harness.server.offerGoogle(google ? CLIENT_ID : null);
  made.harness.server.offerEmail(SITE_KEY);
  return made;
}

async function emailSignIn(made: Browser, email: string = ADA_EMAIL): Promise<string> {
  assert.deepEqual(await made.service.startEmail(email, 'turnstile-ok'), { kind: 'sent', resendAfterMs: 60_000 });
  return made.harness.server.codeFor(email);
}

void test('a server that offers email gives a guest the site key, with or without Google', async (): Promise<void> => {
  const only: Browser = await emailBrowser();
  assert.deepEqual(await only.service.load(), { kind: 'guest', google: null, email: { siteKey: SITE_KEY } });
  const both: Browser = await emailBrowser(true);
  assert.deepEqual(await both.service.load(), { kind: 'guest', google: { clientId: CLIENT_ID }, email: { siteKey: SITE_KEY } });
});

void test('offering sign-in asks the server for nothing but what it offers and who this is', async (): Promise<void> => {
  const made: Browser = await emailBrowser(true);
  const before: number = made.harness.server.requests.length;
  await made.service.load();
  assert.deepEqual(
    made.harness.server.requests.slice(before).map((request): string => request.path),
    ['/v1/auth/providers', '/v1/me'],
  );
});

void test('a right email code keeps the account and the save and swaps only the token, like Google', async (): Promise<void> => {
  const made: Browser = await emailBrowser(false, makeSave(4, 10));
  const before: SyncRecord = record(made.harness);
  const code: string = await emailSignIn(made);
  const start = must(
    made.harness.server.requests.find((request): boolean => request.path === '/v1/auth/email/start'),
    'the start request',
  );
  assert.deepEqual(start.body, { email: ADA_EMAIL, turnstileToken: 'turnstile-ok' });
  assert.equal(start.token, before.token);
  assert.deepEqual(await made.service.verifyEmail(ADA_EMAIL, code), { kind: 'reload' });
  const after: SyncRecord = record(made.harness);
  assert.equal(after.accountId, before.accountId);
  assert.notEqual(after.token, before.token);
  assert.equal(after.revision, before.revision);
  assert.deepEqual(await made.service.load(), { kind: 'signed-in', method: 'email', name: 'a•••@example.com' });
});

void test('an email that already has an account switches this browser to it with a clean record', async (): Promise<void> => {
  const first: Browser = await emailBrowser();
  await first.service.verifyEmail(ADA_EMAIL, await emailSignIn(first));
  const harness: Harness = createSecondBrowser(first.harness);
  await harness.open().load();
  const service: AccountService = serviceFor(harness);
  first.harness.clock.now += 61_000;
  assert.deepEqual(await service.startEmail(ADA_EMAIL, 'turnstile-ok'), { kind: 'sent', resendAfterMs: 60_000 });
  assert.deepEqual(await service.verifyEmail(ADA_EMAIL, first.harness.server.codeFor(ADA_EMAIL)), { kind: 'reload' });
  const switched: SyncRecord = record(harness);
  assert.equal(switched.accountId, owner(first.harness, 0).accountId);
  assert.equal(switched.revision, 0);
});

void test('wrong, expired and spent codes come back as such and leave the guest token alone', async (): Promise<void> => {
  const made: Browser = await emailBrowser();
  const before: SyncRecord = record(made.harness);
  const code: string = await emailSignIn(made);
  const wrong: string = code === '000000' ? '000001' : '000000';
  assert.deepEqual(await made.service.verifyEmail(ADA_EMAIL, wrong), { kind: 'wrong', attemptsLeft: 4 });
  const lefts: readonly number[] = [3, 2, 1, 0];
  const answers = await lefts.reduce(
    (chain: Promise<EmailVerifyResult[]>): Promise<EmailVerifyResult[]> => chain.then(async (seen: EmailVerifyResult[]): Promise<EmailVerifyResult[]> => [...seen, await made.service.verifyEmail(ADA_EMAIL, wrong)]),
    Promise.resolve([]),
  );
  assert.deepEqual(answers, lefts.map((left: number): EmailVerifyResult => ({ kind: 'wrong', attemptsLeft: left })));
  assert.deepEqual(await made.service.verifyEmail(ADA_EMAIL, code), { kind: 'locked' });
  made.harness.clock.now += 61_000;
  const fresh: string = await emailSignIn(made);
  made.harness.clock.now += 600_000;
  assert.deepEqual(await made.service.verifyEmail(ADA_EMAIL, fresh), { kind: 'expired' });
  assert.equal(record(made.harness).token, before.token);
});

void test('a refused send says why: a bad address, a failed bot check, too soon, or no email at all', async (): Promise<void> => {
  const made: Browser = await emailBrowser();
  assert.deepEqual(await made.service.startEmail('not an address', 'turnstile-ok'), { kind: 'invalid-email' });
  assert.deepEqual(await made.service.startEmail(ADA_EMAIL, BAD_TURNSTILE_TOKEN), { kind: 'bot-check' });
  await emailSignIn(made);
  assert.deepEqual(await made.service.startEmail(ADA_EMAIL, 'turnstile-ok'), { kind: 'wait', afterMs: 60_000 });
  made.harness.server.offerEmail(null);
  assert.deepEqual(await made.service.startEmail('bran@example.com', 'turnstile-ok'), { kind: 'unavailable' });
  made.harness.server.offerEmail(SITE_KEY);
  made.harness.server.goDown();
  assert.deepEqual(await made.service.startEmail('bran@example.com', 'turnstile-ok'), { kind: 'unavailable' });
});

void test('an email verify whose answer is lost still signs in when the server linked the account', async (): Promise<void> => {
  const made: Browser = await emailBrowser();
  const code: string = await emailSignIn(made);
  made.harness.server.loseNextAnswer('POST', '/v1/auth/email/verify');
  assert.deepEqual(await made.service.verifyEmail(ADA_EMAIL, code), { kind: 'reload' });
});

void test('the start answers map onto what the entry shows', (): void => {
  assert.deepEqual(emailStartResult({ kind: 'refused', status: 503, code: 'bot_check_unavailable', retryAfterMs: null }), { kind: 'unavailable' });
  assert.deepEqual(emailStartResult({ kind: 'refused', status: 503, code: 'email_unavailable', retryAfterMs: null }), { kind: 'unavailable' });
  assert.deepEqual(emailStartResult({ kind: 'refused', status: 429, code: 'rate_limited', retryAfterMs: 5000 }), { kind: 'wait', afterMs: 5000 });
});
