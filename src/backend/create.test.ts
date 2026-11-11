import assert from 'node:assert/strict';
import { test } from 'node:test';
import { content, createFakeClock, createFakeTimers, createMemoryStore, makeSave } from '../../test/backend-support.ts';
import type { BackendEnvironment } from './create.ts';
import { createBackend, readServerUrl } from './create.ts';

function environment(calls: string[], warnings: string[]): BackendEnvironment {
  const clock = createFakeClock();
  return {
    fetch: (url: string): Promise<Response> => {
      calls.push(url);
      return Promise.reject(new Error('the network must not be used'));
    },
    store: createMemoryStore(),
    clock: clock.read,
    timers: createFakeTimers(clock).timers,
    log: {
      info: (): void => undefined,
      warn: (message: string): void => {
        warnings.push(message);
      },
    },
  };
}

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

void test('with no server url the game saves locally and never touches the network', async (): Promise<void> => {
  const calls: string[] = [];
  await Promise.all(
    [undefined, '', '  '].map(async (raw: string | undefined): Promise<void> => {
      const backend = createBackend(content, raw, environment(calls, []));
      assert.equal(await backend.load(), null);
      assert.equal(backend.save(makeSave(2, 3)), true);
      backend.flush();
      await backend.reset();
      assert.equal(backend.state(), 'offline');
    }),
  );
  assert.deepEqual(calls, []);
});

void test('an invalid server url falls back to local saving, says so once and never touches the network', async (): Promise<void> => {
  const calls: string[] = [];
  const warnings: string[] = [];
  const backend = createBackend(content, 'ftp://example.com', environment(calls, warnings));
  assert.equal(await backend.load(), null);
  backend.save(makeSave(2, 3));
  assert.deepEqual(calls, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? '', /VITE_SERVER_URL/);
});
