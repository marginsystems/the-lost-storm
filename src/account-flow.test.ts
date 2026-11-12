import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeClock, createFakeTimers } from '../test/backend-support.ts';
import type { FakeTimers } from '../test/backend-support.ts';
import { ACCOUNT_NOTES, ACCOUNT_RETRY, createAccountFlow } from './account-flow.ts';
import type { AccountFlow } from './account-flow.ts';
import type { AccountService, AccountState, SignInResult, SignOutResult } from './backend/account.ts';
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
}

interface Script {
  readonly initial: AccountState;
  readonly signIn?: SignInResult;
  readonly signOut?: SignOutResult;
  readonly scriptLoads?: boolean;
  readonly later?: readonly AccountState[];
  readonly renders?: readonly boolean[];
}

const GUEST: AccountState = { kind: 'guest', clientId: 'client-1', nonce: 'nonce-1' };

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
      return Promise.resolve(script.signIn ?? { kind: 'reload' });
    },
    signOut: (): Promise<SignOutResult> => {
      signOuts += 1;
      return Promise.resolve(script.signOut ?? 'reload');
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
    showButton: (clientId: string, nonce: string, press: (credential: string) => void): Promise<boolean> => {
      asked += 1;
      if (script.scriptLoads === false || script.renders?.[asked - 1] === false) return Promise.resolve(false);
      buttons.push({ clientId, nonce, press });
      return Promise.resolve(true);
    },
  });
  return { flow, shown, buttons, credentials, reloads: (): number => reloads, signOuts: (): number => signOuts, busy, timers, loads: (): number => loads };
}

void test('a guest gets a button made with the client id and the nonce from the server', async (): Promise<void> => {
  const { flow, shown, buttons } = stage({ initial: GUEST });
  await flow.start();
  assert.deepEqual(shown, [{ view: { kind: 'guest' }, note: '' }]);
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
  const later: AccountState = { kind: 'guest', clientId: 'client-1', nonce: 'nonce-2' };
  const { flow, shown, buttons, timers } = stage({ initial: GUEST, later: [later], renders: [false, true] });
  await flow.start();
  assert.equal(buttons.length, 0);
  await timers.advance(must(ACCOUNT_RETRY.delaysMs[0], 'the first retry delay'));
  assert.deepEqual(shown.at(-1), { view: { kind: 'guest' }, note: '' });
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
  assert.deepEqual(shown.at(-1), { view: { kind: 'guest' }, note: '' });
  assert.equal(buttons.length, 1);
});

void test('a server without sign-in is not asked again', async (): Promise<void> => {
  const { flow, timers, loads } = stage({ initial: { kind: 'hidden' } });
  await flow.start();
  assert.equal(timers.pending(), 0);
  assert.equal(loads(), 1);
});

void test('after a failed sign-in with the server out of reach the button comes back beside the note, so trying again is possible', async (): Promise<void> => {
  const retry: AccountState = { kind: 'guest', clientId: 'client-1', nonce: 'nonce-2' };
  const { flow, shown, buttons, timers, credentials } = stage({ initial: GUEST, signIn: { kind: 'failed', state: { kind: 'unreachable' } }, later: [retry] });
  await flow.start();
  buttons[0]?.press('lost');
  await settle();
  assert.deepEqual(shown.at(-1), { view: { kind: 'hidden' }, note: ACCOUNT_NOTES.failed });
  await timers.advance(must(ACCOUNT_RETRY.delaysMs[0], 'the first retry delay'));
  assert.deepEqual(shown.at(-1), { view: { kind: 'guest' }, note: ACCOUNT_NOTES.failed });
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
  const retry: AccountState = { kind: 'guest', clientId: 'client-1', nonce: 'nonce-2' };
  const { flow, shown, buttons, reloads } = stage({ initial: GUEST, signIn: { kind: 'failed', state: retry } });
  await flow.start();
  buttons[0]?.press('bad');
  await settle();
  assert.equal(reloads(), 0);
  assert.deepEqual(shown.at(-1), { view: { kind: 'guest' }, note: ACCOUNT_NOTES.failed });
  assert.equal(buttons.at(-1)?.nonce, 'nonce-2');
});

void test('a signed-in player sees their name, and sign-out reloads', async (): Promise<void> => {
  const { flow, shown, reloads, signOuts } = stage({ initial: { kind: 'signed-in', name: 'Ada' } });
  await flow.start();
  assert.deepEqual(shown, [{ view: { kind: 'signed-in', name: 'Ada' }, note: '' }]);
  await flow.signOut();
  assert.equal(signOuts(), 1);
  assert.equal(reloads(), 1);
});

void test('a sign-out with unsynced progress stays signed in and explains why', async (): Promise<void> => {
  const { flow, shown, reloads } = stage({ initial: { kind: 'signed-in', name: 'Ada' }, signOut: 'unsynced' });
  await flow.start();
  await flow.signOut();
  assert.equal(reloads(), 0);
  assert.deepEqual(shown.at(-1), { view: { kind: 'signed-in', name: 'Ada' }, note: ACCOUNT_NOTES.unsynced });
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

  const unsynced: Stage = stage({ initial: { kind: 'signed-in', name: 'Ada' }, signOut: 'unsynced' });
  await unsynced.flow.start();
  await unsynced.flow.signOut();
  assert.deepEqual(unsynced.busy, [true, false]);
});
