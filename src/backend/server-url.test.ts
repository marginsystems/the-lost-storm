import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readServerUrl } from './server-url.ts';

void test('the server url is read as a bare http or https address', (): void => {
  assert.deepEqual(readServerUrl(undefined), { kind: 'none' });
  assert.deepEqual(readServerUrl(''), { kind: 'none' });
  assert.deepEqual(readServerUrl('   '), { kind: 'none' });
  assert.deepEqual(readServerUrl('http://localhost:8787'), { kind: 'ok', url: 'http://localhost:8787' });
  assert.deepEqual(readServerUrl(' https://saves.example.com/ '), { kind: 'ok', url: 'https://saves.example.com' });
  assert.deepEqual(readServerUrl('https://example.com/api/?x=1#y'), { kind: 'ok', url: 'https://example.com/api' });
});

void test('a url that is not http or https, or carries a password, is invalid', (): void => {
  for (const value of ['localhost:8787', 'ftp://example.com', 'not a url', 'http://user:pass@example.com', 'file:///tmp/x']) {
    assert.deepEqual(readServerUrl(value), { kind: 'invalid' }, value);
  }
});
