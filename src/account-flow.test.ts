import assert from 'node:assert/strict';
import { test } from 'node:test';
import { content, createFakeClock, createFakeTimers, createHarness, makeSave } from '../test/backend-support.ts';
import type { FakeTimers, Harness, RecordedRequest } from '../test/backend-support.ts';
import { ACCOUNT_NOTES, ACCOUNT_RETRY, createAccountFlow } from './account-flow.ts';
import type { AccountFlow } from './account-flow.ts';
import { createAccountService } from './backend/account.ts';
import type { AccountService, AccountState, EmailOffer, EmailStartResult, EmailVerifyResult, SignInResult, SignOutResult } from './backend/account.ts';
import { createApi } from './backend/api.ts';
import type { Backend } from './backend/backend.ts';
import type { SaveData } from '../sim/save.ts';
import { must } from '../test/support.ts';
import type { AccountView } from './title-account.ts';

interface Shown {
  readonly view: AccountView;
  readonly note: string;
}

interface Button {
  readonly clientId: string;
  readonly nonce: string;
  readonly press: (credential: string) => void;
}

interface Stage {
  readonly flow: AccountFlow;
  readonly shown: Shown[];
  readonly buttons: Button[];
  readonly credentials: string[];
  readonly reloads: () => number;
  readonly signOuts: () => number;
  readonly busy: boolean[];
  readonly timers: FakeTimers;
  readonly loads: () => number;
  readonly offers: (EmailOffer | null)[];
  readonly verifies: string[];
  readonly order: string[];
}

interface Script {
  readonly initial: AccountState;
  readonly signIn?: SignInResult;
  readonly signOut?: SignOutResult;
  readonly scriptLoads?: boolean;
  readonly later?: readonly AccountState[];
  readonly renders?: readonly boolean[];
  readonly verify?: EmailVerifyResult;
}

const GUEST: AccountState = { kind: 'guest', google: { clientId: 'client-1', nonce: 'nonce-1' }, email: null };

function settle(): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    setImmediate(resolve);
  });
}

async function advanceThrough(timers: FakeTimers, delays: readonly number[]): Promise<void> {
  const [first, ...rest]: readonly number[] = delays;
  if (first === undefined) return;
  await timers.advance(first);
  await advanceThrough(timers, rest);
}

function stage(script: Script): Stage {
  const shown: Shown[] = [];
  const buttons: Button[] = [];
  const credentials: string[] = [];
  const busy: boolean[] = [];
  const offers: (EmailOffer | null)[] = [];
  const verifies: string[] = [];
  const order: string[] = [];
  let reloads: number = 0;
  let signOuts: number = 0;
  let loads: number = 0;
  let asked: number = 0;
  const timers: FakeTimers = createFakeTimers(createFakeClock());
  const account: AccountService = {
    load: (): Promise<AccountState> => {
      loads += 1;
      return Promise.resolve(loads === 1 ? script.initial : (script.later?.[loads - 2] ?? script.later?.at(-1) ?? script.initial));
    },
    signIn: (credential: string): Promise<SignInResult> => {
      credentials.push(credential);
      order.push('sign-in');
      return Promise.resolve(script.signIn ?? { kind: 'reload' });
    },
    signOut: (): Promise<SignOutResult> => {
      signOuts += 1;
      return Promise.resolve(script.signOut ?? 'reload');
    },
    startEmail: (email: string): Promise<EmailStartResult> => Promise.resolve(email === 'bad' ? { kind: 'invalid-email' } : { kind: 'sent', resendAfterMs: 60_000 }),
    verifyEmail: (email: string, code: string): Promise<EmailVerifyResult> => {
      verifies.push(`${email}|${code}`);
      order.push('verify');
      return Promise.resolve(script.verify ?? { kind: 'reload' });
    },
  };
  const flow: AccountFlow = createAccountFlow({
    account,
    view: {
      show: (view: AccountView, note: string): void => {
        shown.push({ view, note });
      },
    },
    timers: timers.timers,
    reload: (): void => {
      reloads += 1;
    },
    setBusy: (next: boolean): void => {
      busy.push(next);
    },
    beforeSignIn: (): void => {
      order.push('flush');
    },
    showButton: (clientId: string, nonce: string, press: (credential: string) => void): Promise<boolean> => {
      asked += 1;
      if (script.scriptLoads === false || script.renders?.[asked - 1] === false) return Promise.resolve(false);
      buttons.push({ clientId, nonce, press });
      return Promise.resolve(true);
    },
    offerEmail: (offer: EmailOffer | null): void => {
      offers.push(offer);
    },
  });
  return { flow, shown, buttons, credentials, reloads: (): number => reloads, signOuts: (): number => signOuts, busy, timers, loads: (): number => loads, offers, verifies, order };
}

void test('a guest gets a button made with the client id and the nonce from the server', async (): Promise<void> => {
  const { flow, shown, buttons } = stage({ initial: GUEST });
  await flow.start();
  assert.deepEqual(shown, [{ view: { kind: 'guest', google: true, email: false }, note: '' }]);
  assert.deepEqual(
    buttons.map((button: Button): readonly string[] => [button.clientId, button.nonce]),
    [['client-1', 'nonce-1']],
  );
});

void test('nothing is shown and no button is asked for when sign-in is not offered', async (): Promise<void> => {
  const { flow, shown, buttons } = stage({ initial: { kind: 'hidden' } });
  await flow.start();
  assert.deepEqual(shown, [{ view: { kind: 'hidden' }, note: '' }]);
  assert.equal(buttons.length, 0);
});

void test('when the sign-in script does not load the control stays hidden and stops asking after the last retry', async (): Promise<void> => {
  const { flow, shown, timers, loads } = stage({ initial: GUEST, scriptLoads: false });
  await flow.start();
  assert.deepEqual(shown, [{ view: { kind: 'hidden' }, note: '' }]);
  await advanceThrough(timers, ACCOUNT_RETRY.delaysMs);
  assert.equal(loads(), 1 + ACCOUNT_RETRY.delaysMs.length);
  assert.equal(timers.pending(), 0);
  assert.ok(shown.every((entry: Shown): boolean => entry.view.kind === 'hidden'));
});

void test('a sign-in script that arrives late still gets its button, with the nonce asked for then', async (): Promise<void> => {
  const later: AccountState = { kind: 'guest', google: { clientId: 'client-1', nonce: 'nonce-2' }, email: null };
  const { flow, shown, buttons, timers } = stage({ initial: GUEST, later: [later], renders: [false, true] });
  await flow.start();
  assert.equal(buttons.length, 0);
  await timers.advance(must(ACCOUNT_RETRY.delaysMs[0], 'the first retry delay'));
  assert.deepEqual(shown.at(-1), { view: { kind: 'guest', google: true, email: false }, note: '' });
  assert.equal(buttons.at(-1)?.nonce, 'nonce-2');
  assert.equal(timers.pending(), 0);
});

void test('a server that cannot be reached at first is asked again until the button can be shown', async (): Promise<void> => {
  const { flow, shown, buttons, timers } = stage({ initial: { kind: 'unreachable' }, later: [{ kind: 'unreachable' }, GUEST] });
  await flow.start();
  assert.deepEqual(shown, [{ view: { kind: 'hidden' }, note: '' }]);
  await timers.advance(must(ACCOUNT_RETRY.delaysMs[0], 'the first retry delay'));
  assert.equal(buttons.length, 0);
  await timers.advance(must(ACCOUNT_RETRY.delaysMs[1], 'the second retry delay'));
  assert.deepEqual(shown.at(-1), { view: { kind: 'guest', google: true, email: false }, note: '' });
  assert.equal(buttons.length, 1);
});

void test('a server without sign-in is not asked again', async (): Promise<void> => {
  const { flow, timers, loads } = stage({ initial: { kind: 'hidden' } });
  await flow.start();
  assert.equal(timers.pending(), 0);
  assert.equal(loads(), 1);
});

void test('after a failed sign-in with the server out of reach the button comes back beside the note, so trying again is possible', async (): Promise<void> => {
  const retry: AccountState = { kind: 'guest', google: { clientId: 'client-1', nonce: 'nonce-2' }, email: null };
  const { flow, shown, buttons, timers, credentials } = stage({ initial: GUEST, signIn: { kind: 'failed', state: { kind: 'unreachable' } }, later: [retry] });
  await flow.start();
  buttons[0]?.press('lost');
  await settle();
  assert.deepEqual(shown.at(-1), { view: { kind: 'hidden' }, note: ACCOUNT_NOTES.failed });
  await timers.advance(must(ACCOUNT_RETRY.delaysMs[0], 'the first retry delay'));
  assert.deepEqual(shown.at(-1), { view: { kind: 'guest', google: true, email: false }, note: ACCOUNT_NOTES.failed });
  assert.equal(buttons.at(-1)?.nonce, 'nonce-2');
  buttons.at(-1)?.press('again');
  await settle();
  assert.deepEqual(credentials, ['lost', 'again']);
});

void test('a credential from the button is exchanged and the page reloads', async (): Promise<void> => {
  const { flow, buttons, credentials, reloads } = stage({ initial: GUEST });
  await flow.start();
  buttons[0]?.press('the-credential');
  await settle();
  assert.deepEqual(credentials, ['the-credential']);
  assert.equal(reloads(), 1);
});

void test('a refused sign-in says so and offers a button with the new nonce', async (): Promise<void> => {
  const retry: AccountState = { kind: 'guest', google: { clientId: 'client-1', nonce: 'nonce-2' }, email: null };
  const { flow, shown, buttons, reloads } = stage({ initial: GUEST, signIn: { kind: 'failed', state: retry } });
  await flow.start();
  buttons[0]?.press('bad');
  await settle();
  assert.equal(reloads(), 0);
  assert.deepEqual(shown.at(-1), { view: { kind: 'guest', google: true, email: false }, note: ACCOUNT_NOTES.failed });
  assert.equal(buttons.at(-1)?.nonce, 'nonce-2');
});

void test('a signed-in player sees their name, and sign-out reloads', async (): Promise<void> => {
  const { flow, shown, reloads, signOuts } = stage({ initial: { kind: 'signed-in', method: 'google', name: 'Ada' } });
  await flow.start();
  assert.deepEqual(shown, [{ view: { kind: 'signed-in', method: 'google', name: 'Ada' }, note: '' }]);
  await flow.signOut();
  assert.equal(signOuts(), 1);
  assert.equal(reloads(), 1);
});

void test('a sign-out with unsynced progress stays signed in and explains why', async (): Promise<void> => {
  const { flow, shown, reloads } = stage({ initial: { kind: 'signed-in', method: 'google', name: 'Ada' }, signOut: 'unsynced' });
  await flow.start();
  await flow.signOut();
  assert.equal(reloads(), 0);
  assert.deepEqual(shown.at(-1), { view: { kind: 'signed-in', method: 'google', name: 'Ada' }, note: ACCOUNT_NOTES.unsynced });
});

void test('sign-out does nothing for a guest', async (): Promise<void> => {
  const { flow, reloads, signOuts } = stage({ initial: GUEST });
  await flow.start();
  await flow.signOut();
  assert.equal(signOuts(), 0);
  assert.equal(reloads(), 0);
});

void test('the title is held while a sign-in or a sign-out is in flight, and released only when the page stays', async (): Promise<void> => {
  const reloading: Stage = stage({ initial: GUEST });
  await reloading.flow.start();
  assert.deepEqual(reloading.busy, []);
  reloading.buttons[0]?.press('the-credential');
  await settle();
  assert.deepEqual(reloading.busy, [true]);

  const refused: Stage = stage({ initial: GUEST, signIn: { kind: 'failed', state: GUEST } });
  await refused.flow.start();
  refused.buttons[0]?.press('bad');
  await settle();
  assert.deepEqual(refused.busy, [true, false]);

  const unsynced: Stage = stage({ initial: { kind: 'signed-in', method: 'google', name: 'Ada' }, signOut: 'unsynced' });
  await unsynced.flow.start();
  await unsynced.flow.signOut();
  assert.deepEqual(unsynced.busy, [true, false]);
});

const EMAIL_GUEST: AccountState = { kind: 'guest', google: null, email: { siteKey: '0x4AAA' } };

void test('a guest on a server that offers only email gets the email entry and no Google button', async (): Promise<void> => {
  const { flow, shown, buttons, offers } = stage({ initial: EMAIL_GUEST });
  await flow.start();
  assert.equal(buttons.length, 0);
  assert.deepEqual(offers, [{ siteKey: '0x4AAA' }]);
  assert.deepEqual(shown, [{ view: { kind: 'guest', google: false, email: true }, note: '' }]);
});

void test('email stays offered when the Google script does not load', async (): Promise<void> => {
  const both: AccountState = { kind: 'guest', google: { clientId: 'client-1', nonce: 'nonce-1' }, email: { siteKey: '0x4AAA' } };
  const { flow, shown, timers } = stage({ initial: both, scriptLoads: false });
  await flow.start();
  assert.deepEqual(shown, [{ view: { kind: 'guest', google: false, email: true }, note: '' }]);
  assert.equal(timers.pending(), 0);
});

void test('a signed-in player is offered no email entry', async (): Promise<void> => {
  const { flow, offers } = stage({ initial: { kind: 'signed-in', method: 'email', name: 'a•••@example.com' } });
  await flow.start();
  assert.deepEqual(offers, [null]);
});

void test('a right email code reloads the page with the busy flag held, like Google', async (): Promise<void> => {
  const { flow, reloads, busy, verifies } = stage({ initial: EMAIL_GUEST });
  await flow.start();
  assert.deepEqual(await flow.verifyEmailCode('ada@example.com', '042917'), { kind: 'reload' });
  assert.deepEqual(verifies, ['ada@example.com|042917']);
  assert.equal(reloads(), 1);
  assert.deepEqual(busy, [true]);
});

void test('a wrong email code hands the tries left back to the entry and frees the page', async (): Promise<void> => {
  const { flow, reloads, busy } = stage({ initial: EMAIL_GUEST, verify: { kind: 'wrong', attemptsLeft: 3 } });
  await flow.start();
  assert.deepEqual(await flow.verifyEmailCode('ada@example.com', '000000'), { kind: 'wrong', attemptsLeft: 3 });
  assert.equal(reloads(), 0);
  assert.deepEqual(busy, [true, false]);
});

void test('an email sign-in that fails shows the state the server gives with the failure note', async (): Promise<void> => {
  const { flow, shown } = stage({ initial: EMAIL_GUEST, verify: { kind: 'failed', state: EMAIL_GUEST } });
  await flow.start();
  await flow.verifyEmailCode('ada@example.com', '042917');
  assert.deepEqual(shown.at(-1), { view: { kind: 'guest', google: false, email: true }, note: ACCOUNT_NOTES.failed });
});

void test('the save is flushed before a Google credential or an email code is sent, and not when nothing is sent', async (): Promise<void> => {
  const google: Stage = stage({ initial: GUEST });
  await google.flow.start();
  assert.deepEqual(google.order, []);
  google.buttons[0]?.press('the-credential');
  await settle();
  assert.deepEqual(google.order, ['flush', 'sign-in']);
  const email: Stage = stage({ initial: EMAIL_GUEST });
  await email.flow.start();
  await email.flow.sendEmailCode('ada@example.com', 'turnstile');
  assert.deepEqual(email.order, []);
  await email.flow.verifyEmailCode('ada@example.com', '042917');
  assert.deepEqual(email.order, ['flush', 'verify']);
});

void test('asking again shows the control with a note and a button made with a new nonce', async (): Promise<void> => {
  const later: AccountState = { kind: 'guest', google: { clientId: 'client-1', nonce: 'nonce-2' }, email: null };
  const { flow, shown, buttons } = stage({ initial: GUEST, later: [later] });
  await flow.start();
  await flow.refresh('Sign in to keep this character.');
  assert.deepEqual(shown.at(-1), { view: { kind: 'guest', google: true, email: false }, note: 'Sign in to keep this character.' });
  assert.equal(buttons.at(-1)?.nonce, 'nonce-2');
});

interface LiveGuest {
  readonly harness: Harness;
  readonly backend: Backend;
  readonly flow: AccountFlow;
  readonly buttons: Button[];
  readonly reloads: () => number;
}

const SERVER_URL: string = 'http://localhost:8787';

async function liveGuest(flushes: boolean): Promise<LiveGuest> {
  const harness: Harness = createHarness();
  harness.server.offerGoogle('client-1');
  const backend: Backend = harness.open(SERVER_URL);
  await backend.load();
  const buttons: Button[] = [];
  let reloads: number = 0;
  const flow: AccountFlow = createAccountFlow({
    account: createAccountService({ serverUrl: SERVER_URL, api: createApi(SERVER_URL, harness.server.fetch, content), store: harness.store }),
    view: { show: (): void => undefined },
    timers: harness.timers.timers,
    reload: (): void => {
      reloads += 1;
    },
    setBusy: (): void => undefined,
    beforeSignIn: (): void => {
      if (flushes) backend.flush();
    },
    showButton: (clientId: string, nonce: string, press: (credential: string) => void): Promise<boolean> => {
      buttons.push({ clientId, nonce, press });
      return Promise.resolve(true);
    },
    offerEmail: (): void => undefined,
  });
  await flow.start();
  return { harness, backend, flow, buttons, reloads: (): number => reloads };
}

async function signInWithGoogle(guest: LiveGuest, subject: string): Promise<void> {
  const button: Button = must(guest.buttons.at(-1), 'the sign-in button');
  button.press(`google|${subject}|${button.nonce}|Ada`);
  await settle();
  await settle();
  await settle();
}

function paths(harness: Harness): string[] {
  return harness.server.requests.map((request: RecordedRequest): string => `${request.method} ${request.path}`);
}

void test('a guest whose newest progress the cloud has not got signs in and reloads into the same character on the same account', async (): Promise<void> => {
  const guest: LiveGuest = await liveGuest(true);
  const { harness } = guest;
  guest.backend.save(makeSave(6, 40));
  assert.equal(must(harness.server.accounts[0], 'the guest account').save, null);
  await signInWithGoogle(guest, 'ada');
  assert.equal(guest.reloads(), 1);
  assert.equal(paths(harness).includes('PUT /v1/save'), true);
  assert.equal(harness.server.accounts.length, 1);
  const linked = must(harness.server.accounts[0], 'the linked account');
  assert.equal(linked.google, 'ada');
  assert.equal(linked.save?.level, 6);
  const reloaded: SaveData | null = await harness.open(SERVER_URL).load();
  assert.deepEqual([reloaded?.level, reloaded?.xp], [6, 40]);
  assert.equal(harness.server.accounts.length, 1);
  assert.equal(must(harness.server.accounts[0], 'the account after the reload').save?.level, 6);
});

void test('a guest whose save the server refuses during the sign-in still reloads into the same character, and it reaches the linked account afterwards', async (): Promise<void> => {
  const guest: LiveGuest = await liveGuest(true);
  const { harness } = guest;
  guest.backend.save(makeSave(6, 40));
  harness.server.plan(503, {}, 'PUT');
  await signInWithGoogle(guest, 'ada');
  assert.equal(guest.reloads(), 1);
  const linked = must(harness.server.accounts[0], 'the linked account');
  assert.equal(linked.google, 'ada');
  assert.equal(linked.save, null);
  const reloaded: SaveData | null = await harness.open(SERVER_URL).load();
  assert.deepEqual([reloaded?.level, reloaded?.xp], [6, 40]);
  await harness.timers.advance(0);
  await settle();
  assert.equal(harness.server.accounts.length, 1);
  assert.equal(must(harness.server.accounts[0], 'the account after the upload').save?.level, 6);
});

void test('without the flush the newest progress would still be only in the browser when the sign-in is sent', async (): Promise<void> => {
  const guest: LiveGuest = await liveGuest(false);
  guest.backend.save(makeSave(6, 40));
  await signInWithGoogle(guest, 'ada');
  assert.equal(guest.reloads(), 1);
  assert.equal(paths(guest.harness).includes('PUT /v1/save'), false);
  assert.equal(must(guest.harness.server.accounts[0], 'the linked account').save, null);
});

void test('a sign-in to an identity that already has a further-along character loads that character, and the flush goes to the guest account, never over it', async (): Promise<void> => {
  const first: LiveGuest = await liveGuest(true);
  first.backend.save(makeSave(9, 5));
  await signInWithGoogle(first, 'ada');
  const second: Harness = createHarness(first.harness);
  const backend: Backend = second.open(SERVER_URL);
  await backend.load();
  const buttons: Button[] = [];
  const flow: AccountFlow = createAccountFlow({
    account: createAccountService({ serverUrl: SERVER_URL, api: createApi(SERVER_URL, second.server.fetch, content), store: second.store }),
    view: { show: (): void => undefined },
    timers: second.timers.timers,
    reload: (): void => undefined,
    setBusy: (): void => undefined,
    beforeSignIn: (): void => backend.flush(),
    showButton: (clientId: string, nonce: string, press: (credential: string) => void): Promise<boolean> => {
      buttons.push({ clientId, nonce, press });
      return Promise.resolve(true);
    },
    offerEmail: (): void => undefined,
  });
  await flow.start();
  backend.save(makeSave(3, 0));
  const button: Button = must(buttons.at(-1), 'the second sign-in button');
  button.press(`google|ada|${button.nonce}|Ada`);
  await settle();
  await settle();
  await settle();
  assert.equal(must(second.server.accounts[0], 'the account of the identity').save?.level, 9);
  assert.equal(must(second.server.accounts[1], 'the guest account').save?.level, 3);
  const reloaded: SaveData | null = await second.open(SERVER_URL).load();
  assert.equal(reloaded?.level, 9);
  await second.timers.advance(0);
  await settle();
  assert.equal(must(second.server.accounts[0], 'the account of the identity after the reload').save?.level, 9);
});
