import assert from 'node:assert/strict';
import { test } from 'node:test';
import { content, createFakeClock, createFakeTimers, createMemoryStore, makeSave, preEpochLocal } from '../../test/backend-support.ts';
import { SAVE_KEY } from './local.ts';
import type { BackendEnvironment } from './create.ts';
import { createBackend } from './create.ts';

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

void test('with no server url a save from before the wipe is discarded on load, so the title offers Enter, not Continue', async (): Promise<void> => {
  const calls: string[] = [];
  const env: BackendEnvironment = environment(calls, []);
  env.store.write(SAVE_KEY, preEpochLocal(makeSave(12, 900)));
  const backend = createBackend(content, undefined, env);
  assert.equal(await backend.load(), null);
  assert.equal(env.store.read(SAVE_KEY), null);
  backend.save(makeSave(1, 4));
  assert.equal((await createBackend(content, undefined, env).load())?.xp, 4);
  assert.deepEqual(calls, []);
});
