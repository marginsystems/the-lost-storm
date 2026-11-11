import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readCredential, readIdentityApi } from './google-identity.ts';

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
