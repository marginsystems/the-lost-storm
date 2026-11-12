import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MarkImage } from './google-identity.ts';
import { GOOGLE_IDENTITY, readCredential, readIdentityApi, showGoogleMark } from './google-identity.ts';

function initialize(): void {
  return undefined;
}

function renderButton(): void {
  return undefined;
}

void test('the credential is read from the answer Google hands the page', (): void => {
  assert.equal(readCredential({ credential: 'abc.def.ghi', select_by: 'btn' }), 'abc.def.ghi');
  for (const answer of [null, undefined, 'abc', {}, { credential: '' }, { credential: 7 }]) assert.equal(readCredential(answer), null);
});

void test('the sign-in script counts as loaded only when it exposes both calls the page needs', (): void => {
  assert.notEqual(readIdentityApi({ google: { accounts: { id: { initialize, renderButton } } } }), null);
  for (const globals of [{}, null, { google: {} }, { google: { accounts: {} } }, { google: { accounts: { id: { initialize } } } }, { google: { accounts: { id: { initialize: 'x', renderButton } } } }]) {
    assert.equal(readIdentityApi(globals), null);
  }
});

void test('looking for the script reads only the property it needs', (): void => {
  const globals: object = { google: { accounts: { id: { initialize, renderButton } } } };
  Object.defineProperty(globals, 'localStorage', {
    enumerable: true,
    get: (): never => {
      throw new Error('storage is blocked');
    },
  });
  assert.notEqual(readIdentityApi(globals), null);
});

void test('the Google mark comes from Google at run time and is marked loaded only once the image has arrived', (): void => {
  const classes: Set<string> = new Set<string>();
  const loads: (() => void)[] = [];
  const image: MarkImage = {
    src: '',
    classList: {
      add: (token: string): void => {
        classes.add(token);
      },
    },
    addEventListener: (_type: 'load', listener: () => void): void => {
      loads.push(listener);
    },
  };
  showGoogleMark(image);
  assert.equal(image.src, GOOGLE_IDENTITY.mark);
  assert.match(GOOGLE_IDENTITY.mark, /^https:\/\/www\.gstatic\.com\//);
  assert.equal(classes.has(GOOGLE_IDENTITY.markLoaded), false);
  for (const load of loads) load();
  assert.equal(classes.has(GOOGLE_IDENTITY.markLoaded), true);
});
