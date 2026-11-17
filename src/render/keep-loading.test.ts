import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FakeClock, FakeTimers } from '../../test/backend-support.ts';
import { createFakeClock, createFakeTimers, settle } from '../../test/backend-support.ts';
import type { KeepLoadingDeps, KeptLoad } from './keep-loading.ts';
import { KEEP_LOADING, keepLoading, loadAllKeepTrying, retryDelay } from './keep-loading.ts';
import { STALL, withStallLimit } from './stall-limit.ts';

interface FakeModelLoader {
  readonly asked: () => number;
  load(path: string): Promise<string>;
  answer(index: number): void;
  refuse(index: number): void;
}

interface Asked {
  readonly path: string;
  readonly resolve: (model: string) => void;
  readonly reject: (error: Error) => void;
}

function fakeModelLoader(): FakeModelLoader {
  const asked: Asked[] = [];
  return {
    asked: (): number => asked.length,
    load: (path: string): Promise<string> =>
      new Promise<string>((resolve: (model: string) => void, reject: (error: Error) => void): void => {
        asked.push({ path, resolve, reject });
      }),
    answer: (index: number): void => {
      const request: Asked | undefined = asked[index];
      if (request === undefined) throw new Error(`request ${index} was never made`);
      request.resolve(`model of ${request.path}`);
    },
    refuse: (index: number): void => {
      const request: Asked | undefined = asked[index];
      if (request === undefined) throw new Error(`request ${index} was never made`);
      request.reject(new Error(`${request.path} failed`));
    },
  };
}

interface Harness {
  readonly clock: FakeClock;
  readonly fake: FakeTimers;
  readonly warnings: string[];
  readonly deps: KeepLoadingDeps;
}

function harness(): Harness {
  const clock: FakeClock = createFakeClock();
  const fake: FakeTimers = createFakeTimers(clock);
  const warnings: string[] = [];
  return { clock, fake, warnings, deps: { timers: fake.timers, warn: (message: string): void => void warnings.push(message) } };
}

function watch(promise: Promise<unknown>): { readonly done: () => boolean } {
  let done: boolean = false;
  void promise.then((): boolean => {
    done = true;
    return done;
  });
  return { done: (): boolean => done };
}

void test('the wait between tries grows from two seconds and stops growing at thirty', (): void => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 12].map(retryDelay), [2000, 4000, 8000, 16_000, KEEP_LOADING.longestDelayMs, KEEP_LOADING.longestDelayMs, KEEP_LOADING.longestDelayMs]);
});

void test('a model that loads at once says nothing and lands in the library', async (): Promise<void> => {
  const { deps, warnings } = harness();
  const loader: FakeModelLoader = fakeModelLoader();
  const library: Map<string, string> = new Map<string, string>();
  const kept: KeptLoad = keepLoading('Rig thrower', async (): Promise<void> => void library.set('thrower', await loader.load('Throw.glb')), deps);
  loader.answer(0);
  assert.equal(await kept.first, true);
  await kept.done;
  assert.equal(library.get('thrower'), 'model of Throw.glb');
  assert.deepEqual(warnings, []);
});

void test('a model whose load fails is tried again after a wait, lands late, and the rig is named in the console both times', async (): Promise<void> => {
  const { deps, fake, warnings } = harness();
  const loader: FakeModelLoader = fakeModelLoader();
  const library: Map<string, string> = new Map<string, string>();
  const kept: KeptLoad = keepLoading('Rig thrower', async (): Promise<void> => void library.set('thrower', await loader.load('Throw.glb')), deps);
  const done = watch(kept.done);
  loader.refuse(0);
  assert.equal(await kept.first, false);
  await settle();
  assert.match(warnings[0] ?? '', /^Rig thrower is late: try 1 failed \(Throw\.glb failed\); trying again in 2 s$/);
  assert.equal(loader.asked(), 1);
  await fake.advance(retryDelay(1) - 1);
  assert.equal(loader.asked(), 1);
  await fake.advance(1);
  assert.equal(loader.asked(), 2);
  loader.answer(1);
  await settle();
  assert.equal(done.done(), true);
  assert.equal(library.get('thrower'), 'model of Throw.glb');
  assert.match(warnings.at(-1) ?? '', /^Rig thrower arrived late, after 2 tries$/);
});

void test('a first request that never answers is abandoned at the stall limit and the next try brings the model in', async (): Promise<void> => {
  const { deps, fake, warnings } = harness();
  const loader: FakeModelLoader = fakeModelLoader();
  const library: Map<string, string> = new Map<string, string>();
  const stalled = (): Promise<string> => withStallLimit((): Promise<string> => loader.load('Throw.glb'), fake.timers, STALL.limitMs, 'Throw.glb');
  const kept: KeptLoad = keepLoading('Rig thrower', async (): Promise<void> => void library.set('thrower', await stalled()), deps);
  const done = watch(kept.done);
  await fake.advance(STALL.limitMs);
  assert.equal(await kept.first, false);
  await settle();
  assert.match(warnings[0] ?? '', /Throw\.glb stopped loading/);
  await fake.advance(retryDelay(1));
  assert.equal(loader.asked(), 2);
  loader.answer(1);
  await settle();
  assert.equal(done.done(), true);
  assert.equal(library.has('thrower'), true);
});

void test('a model that never arrives keeps being tried with a capped wait, and never stops trying', async (): Promise<void> => {
  const { deps, fake, warnings } = harness();
  let tries: number = 0;
  const kept: KeptLoad = keepLoading(
    'Rig thrower',
    (): Promise<void> => {
      tries += 1;
      return Promise.reject(new Error('gone'));
    },
    deps,
  );
  const done = watch(kept.done);
  assert.equal(await kept.first, false);
  const waitOut = async (failures: number): Promise<void> => {
    if (failures > 8) return;
    assert.equal(fake.nextDelay(), retryDelay(failures));
    await fake.advance(retryDelay(failures));
    await waitOut(failures + 1);
  };
  await waitOut(1);
  assert.equal(tries, 9);
  assert.equal(fake.nextDelay(), KEEP_LOADING.longestDelayMs);
  assert.equal(done.done(), false);
  assert.equal(warnings.length, 9);
  assert.ok(warnings.every((warning: string): boolean => warning.startsWith('Rig thrower is late')));
});

void test('the late stage settles once every model has had its first try, and a failed one still lands later on its own', async (): Promise<void> => {
  const { deps, fake } = harness();
  const loader: FakeModelLoader = fakeModelLoader();
  const library: Map<string, string> = new Map<string, string>();
  const late = watch(
    loadAllKeepTrying(
      ['taker', 'thrower', 'brute'].map((id: string) => ({ what: `Rig ${id}`, load: async (): Promise<void> => void library.set(id, await loader.load(`${id}.glb`)) })),
      deps,
    ),
  );
  loader.answer(0);
  loader.refuse(1);
  await settle();
  assert.equal(late.done(), false);
  loader.answer(2);
  await settle();
  assert.equal(late.done(), true);
  assert.deepEqual([...library.keys()].toSorted(), ['brute', 'taker']);
  await fake.advance(retryDelay(1));
  loader.answer(3);
  await settle();
  assert.deepEqual([...library.keys()].toSorted(), ['brute', 'taker', 'thrower']);
});
