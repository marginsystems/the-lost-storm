import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AskEnd, GoogleIdentity, MarkImage } from './google-identity.ts';
import { GOOGLE_IDENTITY, readAccessToken, readEnd, readIdentityApi, showGoogleMark } from './google-identity.ts';
import { must } from '../test/support.ts';

interface FakeGoogle {
  readonly globals: unknown;
  readonly made: Record<string, unknown>[];
  readonly requests: () => number;
}

function fakeGoogle(withRequest: boolean): FakeGoogle {
  const made: Record<string, unknown>[] = [];
  let requests: number = 0;
  const initTokenClient = (options: Record<string, unknown>): unknown => {
    made.push(options);
    return withRequest
      ? {
          requestAccessToken: (): void => {
            requests += 1;
          },
        }
      : {};
  };
  return { globals: { google: { accounts: { oauth2: { initTokenClient } } } }, made, requests: (): number => requests };
}

function call(options: Record<string, unknown>, key: string, argument: unknown): void {
  const handler: unknown = options[key];
  assert.equal(typeof handler, 'function');
  if (typeof handler === 'function') Reflect.apply(handler, undefined, [argument]);
}

void test('the access token is read from the answer Google hands the page', (): void => {
  assert.equal(readAccessToken({ access_token: 'ya29.abc', token_type: 'Bearer' }), 'ya29.abc');
  for (const answer of [null, undefined, 'abc', {}, { access_token: '' }, { access_token: 7 }, { error: 'access_denied' }]) assert.equal(readAccessToken(answer), null);
});

void test('a closed window and a declined consent are the player backing out, a blocked window is said to be blocked, and anything else failed', (): void => {
  assert.equal(readEnd({ type: 'popup_closed' }), 'closed');
  assert.equal(readEnd({ error: 'access_denied' }), 'closed');
  assert.equal(readEnd({ type: 'popup_failed_to_open' }), 'blocked');
  for (const error of [null, {}, { type: 'unknown' }, { type: 7 }, { error: 'server_error' }]) assert.equal(readEnd(error), 'failed');
});

void test('the sign-in script counts as loaded only when it exposes the token call the page needs', (): void => {
  assert.notEqual(readIdentityApi(fakeGoogle(true).globals), null);
  for (const globals of [{}, null, { google: {} }, { google: { accounts: {} } }, { google: { accounts: { oauth2: {} } } }, { google: { accounts: { oauth2: { initTokenClient: 'x' } } } }, { google: { accounts: { id: { initialize: (): void => undefined } } } }]) {
    assert.equal(readIdentityApi(globals), null);
  }
});

void test('looking for the script reads only the property it needs', (): void => {
  const globals: object = { google: { accounts: { oauth2: { initTokenClient: (): unknown => ({}) } } } };
  Object.defineProperty(globals, 'localStorage', {
    enumerable: true,
    get: (): never => {
      throw new Error('storage is blocked');
    },
  });
  assert.notEqual(readIdentityApi(globals), null);
});

void test('the window is asked for with the client id, the identity scopes and an account choice, and only when the button is pressed', (): void => {
  const google: FakeGoogle = fakeGoogle(true);
  const identity: GoogleIdentity = must(readIdentityApi(google.globals), 'the identity api');
  const tokens: string[] = [];
  const ends: AskEnd[] = [];
  const asker = identity.start({ clientId: 'client-1', onToken: (token: string): number => tokens.push(token), onEnd: (end: AskEnd): number => ends.push(end) });
  const options: Record<string, unknown> = must(google.made[0], 'the token client options');
  assert.equal(options['client_id'], 'client-1');
  assert.equal(options['scope'], 'openid profile');
  assert.equal(options['prompt'], 'select_account');
  assert.equal(google.requests(), 0);
  asker.ask();
  assert.equal(google.requests(), 1);
  call(options, 'callback', { access_token: 'ya29.abc' });
  assert.deepEqual(tokens, ['ya29.abc']);
  call(options, 'callback', { error: 'access_denied' });
  call(options, 'error_callback', { type: 'popup_closed' });
  call(options, 'error_callback', { type: 'popup_failed_to_open' });
  call(options, 'callback', {});
  assert.deepEqual(ends, ['closed', 'closed', 'blocked', 'failed']);
  assert.deepEqual(tokens, ['ya29.abc']);
});

void test('a token client with no way to ask ends the ask as failed, so the button never stays on Signing in', (): void => {
  const google: FakeGoogle = fakeGoogle(false);
  const ends: AskEnd[] = [];
  must(readIdentityApi(google.globals), 'the identity api').start({ clientId: 'client-1', onToken: (): void => undefined, onEnd: (end: AskEnd): number => ends.push(end) }).ask();
  assert.deepEqual(ends, ['failed']);
});

interface FakeImage {
  readonly image: MarkImage;
  readonly classes: Set<string>;
  readonly fire: (type: 'load' | 'error') => void;
}

function fakeImage(): FakeImage {
  const classes: Set<string> = new Set<string>();
  const listeners: { readonly type: 'load' | 'error'; readonly listener: () => void }[] = [];
  const image: MarkImage = {
    src: '',
    classList: {
      add: (token: string): void => {
        classes.add(token);
      },
    },
    addEventListener: (type: 'load' | 'error', listener: () => void): void => {
      listeners.push({ type, listener });
    },
  };
  return {
    image,
    classes,
    fire: (type: 'load' | 'error'): void => {
      for (const entry of listeners) if (entry.type === type) entry.listener();
    },
  };
}

void test('the Google mark comes from Google at run time, and the wait for it ends once the image has arrived', async (): Promise<void> => {
  const fake: FakeImage = fakeImage();
  const seen: { arrived: boolean } = { arrived: false };
  const waiting: Promise<void> = (async (): Promise<void> => {
    await showGoogleMark(fake.image);
    seen.arrived = true;
  })();
  assert.equal(fake.image.src, GOOGLE_IDENTITY.mark);
  assert.match(GOOGLE_IDENTITY.mark, /^https:\/\/www\.gstatic\.com\//);
  assert.equal(fake.classes.has(GOOGLE_IDENTITY.markLoaded), false);
  await Promise.resolve();
  assert.equal(seen.arrived, false);
  fake.fire('load');
  await waiting;
  assert.equal(fake.classes.has(GOOGLE_IDENTITY.markLoaded), true);
});

void test('a mark that fails to load ends the wait too, without being marked loaded', async (): Promise<void> => {
  const fake: FakeImage = fakeImage();
  const waiting: Promise<void> = showGoogleMark(fake.image);
  fake.fire('error');
  await waiting;
  assert.equal(fake.classes.has(GOOGLE_IDENTITY.markLoaded), false);
});
