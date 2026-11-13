import assert from 'node:assert/strict';
import test from 'node:test';
import type { FakeTimers } from '../../test/backend-support.ts';
import { createFakeClock, createFakeTimers, settle } from '../../test/backend-support.ts';
import { LoadStalled, withStallLimit } from './stall-limit.ts';

interface Pending<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
}

function ignore(): void {
  return undefined;
}

function pending<T>(): Pending<T> {
  let resolve: (value: T) => void = ignore;
  let reject: (reason: unknown) => void = ignore;
  const promise: Promise<T> = new Promise<T>((done: (value: T) => void, fail: (reason: unknown) => void): void => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function setup(): { readonly fake: FakeTimers; readonly load: Pending<string>; readonly ping: { current: () => void }; readonly result: Promise<string> } {
  const fake: FakeTimers = createFakeTimers(createFakeClock());
  const load: Pending<string> = pending<string>();
  const ping: { current: () => void } = { current: (): void => undefined };
  const result: Promise<string> = withStallLimit(
    (progress: () => void): Promise<string> => {
      ping.current = progress;
      return load.promise;
    },
    fake.timers,
    1000,
    'models/x.glb',
  );
  return { fake, load, ping, result };
}

async function keepAlive(fake: FakeTimers, ping: { current: () => void }, steps: number): Promise<void> {
  if (steps === 0) return;
  await fake.advance(900);
  ping.current();
  await keepAlive(fake, ping, steps - 1);
}

void test('a load that answers in time resolves and leaves no timer behind', async (): Promise<void> => {
  const { fake, load, result } = setup();
  await fake.advance(900);
  load.resolve('model');
  assert.equal(await result, 'model');
  assert.equal(fake.pending(), 0);
});

void test('a load that keeps reporting progress is never cut off, however long it takes', async (): Promise<void> => {
  const { fake, load, ping, result } = setup();
  await keepAlive(fake, ping, 10);
  load.resolve('slow but alive');
  assert.equal(await result, 'slow but alive');
});

void test('a load with no progress for the whole limit rejects as stalled, and a late answer is ignored', async (): Promise<void> => {
  const { fake, load, result } = setup();
  const outcome: Promise<unknown> = result.catch((error: unknown): unknown => error);
  await fake.advance(1000);
  const error: unknown = await outcome;
  assert.ok(error instanceof LoadStalled);
  assert.equal(error.message, 'models/x.glb stopped loading');
  load.resolve('too late');
  await settle();
  assert.equal(fake.pending(), 0);
});

void test('a load that fails keeps its own error', async (): Promise<void> => {
  const { fake, load, result } = setup();
  load.reject(new Error('404'));
  await assert.rejects(result, /404/);
  assert.equal(fake.pending(), 0);
});
