import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BufferLoader } from './buffers.ts';
import { createBufferLoader, LOOP_LOAD, PLAY_LOAD, WARM_LOAD } from './buffers.ts';
import type { BufferCache } from './cache.ts';
import { createBufferCache } from './cache.ts';

interface Rig {
  readonly loader: BufferLoader<string>;
  readonly cache: BufferCache<string>;
  readonly urls: string[];
  readonly behaviours: ((url: string) => Promise<ArrayBuffer>)[];
  advance(seconds: number): void;
  ready: boolean;
}

function rig(base: string | null): Rig {
  const urls: string[] = [];
  const behaviours: ((url: string) => Promise<ArrayBuffer>)[] = [];
  const cache: BufferCache<string> = createBufferCache<string>(1000, (value: string): number => value.length);
  let now: number = 0;
  const state: Rig = {
    urls,
    behaviours,
    cache,
    ready: true,
    advance(seconds: number): void {
      now += seconds;
    },
    loader: createBufferLoader<string>({
      base,
      clock: (): number => now,
      cache,
      failedRetrySeconds: 30,
      timeoutMs: 30,
      ready: (): boolean => state.ready,
      fetchBytes: (url: string): Promise<ArrayBuffer> => {
        urls.push(url);
        const behave: ((url: string) => Promise<ArrayBuffer>) | undefined = behaviours.shift();
        return behave === undefined ? Promise.resolve(new ArrayBuffer(4)) : behave(url);
      },
      decode: (bytes: ArrayBuffer): Promise<string> => Promise.resolve(`decoded${bytes.byteLength}`),
    }),
  };
  return state;
}

const FAIL: (url: string) => Promise<ArrayBuffer> = (): Promise<ArrayBuffer> => Promise.reject(new Error('503'));

void test('a sound is fetched once, decoded, cached and then served from the cache', async (): Promise<void> => {
  const one: Rig = rig('http://localhost:5210/');
  assert.equal(await one.loader.load('a/one_1.ogg'), 'decoded4');
  assert.equal(await one.loader.load('a/one_1.ogg'), 'decoded4');
  assert.deepEqual(one.urls, ['http://localhost:5210/a/one_1.ogg']);
  assert.equal(one.cache.has('a/one_1.ogg'), true);
});

void test('two requests for a sound that is still loading share one fetch', async (): Promise<void> => {
  const two: Rig = rig('http://localhost:5210/');
  const both: (string | null)[] = await Promise.all([two.loader.load('a/one_1.ogg'), two.loader.load('a/one_1.ogg')]);
  assert.deepEqual(both, ['decoded4', 'decoded4']);
  assert.equal(two.urls.length, 1);
});

void test('with no base, or no audio graph yet, nothing is fetched', async (): Promise<void> => {
  const none: Rig = rig(null);
  assert.equal(await none.loader.load('a/one_1.ogg'), null);
  const early: Rig = rig('http://localhost:5210/');
  early.ready = false;
  assert.equal(await early.loader.load('a/one_1.ogg'), null);
  assert.deepEqual([...none.urls, ...early.urls], []);
});

void test('a path that would leave the base is refused without a request', async (): Promise<void> => {
  const bad: Rig = rig('http://localhost:5210/');
  assert.equal(await bad.loader.load('../secret.ogg'), null);
  assert.equal(await bad.loader.load('https://evil.example/x.ogg'), null);
  assert.deepEqual(bad.urls, []);
});

void test('a failed play-time fetch is not repeated for 30 seconds, then tried again', async (): Promise<void> => {
  const three: Rig = rig('http://localhost:5210/');
  three.behaviours.push(FAIL);
  assert.equal(await three.loader.load('a/one_1.ogg', PLAY_LOAD), null);
  three.advance(29);
  assert.equal(await three.loader.load('a/one_1.ogg', PLAY_LOAD), null);
  assert.equal(three.urls.length, 1);
  three.advance(1);
  assert.equal(await three.loader.load('a/one_1.ogg', PLAY_LOAD), 'decoded4');
  assert.equal(three.urls.length, 2);
});

void test('a failed warm-up fetch leaves no mark, so the first real play tries at once', async (): Promise<void> => {
  const four: Rig = rig('http://localhost:5210/');
  four.behaviours.push(FAIL);
  assert.equal(await four.loader.load('a/one_1.ogg', WARM_LOAD), null);
  assert.equal(await four.loader.load('a/one_1.ogg', PLAY_LOAD), 'decoded4');
  assert.equal(four.urls.length, 2);
});

void test('a loop is decoded but not kept in the cache', async (): Promise<void> => {
  const five: Rig = rig('http://localhost:5210/');
  assert.equal(await five.loader.load('ambience/wind_1.ogg', LOOP_LOAD), 'decoded4');
  assert.equal(five.cache.has('ambience/wind_1.ogg'), false);
  assert.equal(five.cache.bytes, 0);
});

void test('a fetch that never answers times out, is marked failed and does not leave the sound stuck', async (): Promise<void> => {
  const six: Rig = rig('http://localhost:5210/');
  six.behaviours.push((): Promise<ArrayBuffer> => new Promise<ArrayBuffer>((): void => undefined));
  assert.equal(await six.loader.load('a/one_1.ogg'), null);
  six.advance(30);
  assert.equal(await six.loader.load('a/one_1.ogg'), 'decoded4');
});

void test('a fetch that throws before it returns a promise does not leave a stale pending entry', async (): Promise<void> => {
  const seven: Rig = rig('http://localhost:5210/');
  seven.behaviours.push((): Promise<ArrayBuffer> => {
    throw new TypeError('not supported here');
  });
  assert.equal(await seven.loader.load('a/one_1.ogg', WARM_LOAD), null);
  assert.equal(await seven.loader.load('a/one_1.ogg', PLAY_LOAD), 'decoded4');
});

void test('a decode failure counts as a failed load', async (): Promise<void> => {
  const failing: BufferLoader<string> = createBufferLoader<string>({
    base: 'http://localhost:5210/',
    clock: (): number => 0,
    cache: createBufferCache<string>(100, (value: string): number => value.length),
    failedRetrySeconds: 30,
    timeoutMs: 30,
    ready: (): boolean => true,
    fetchBytes: (): Promise<ArrayBuffer> => Promise.resolve(new ArrayBuffer(1)),
    decode: (): Promise<string> => Promise.reject(new Error('bad data')),
  });
  assert.equal(await failing.load('a/one_1.ogg'), null);
});

interface Gate {
  readonly rejects: ((reason: Error) => void)[];
  readonly resolves: ((bytes: ArrayBuffer) => void)[];
  readonly behave: (url: string) => Promise<ArrayBuffer>;
}

function gate(): Gate {
  const rejects: ((reason: Error) => void)[] = [];
  const resolves: ((bytes: ArrayBuffer) => void)[] = [];
  return {
    rejects,
    resolves,
    behave: (): Promise<ArrayBuffer> =>
      new Promise<ArrayBuffer>((resolve: (bytes: ArrayBuffer) => void, reject: (reason: Error) => void): void => {
        resolves.push(resolve);
        rejects.push(reject);
      }),
  };
}

void test('a play that joined a warm-up which then fails fetches for itself and plays', async (): Promise<void> => {
  const eight: Rig = rig('http://localhost:5210/');
  const held: Gate = gate();
  eight.behaviours.push(held.behave);
  const warm: Promise<string | null> = eight.loader.load('a/one_1.ogg', WARM_LOAD);
  const play: Promise<string | null> = eight.loader.load('a/one_1.ogg', PLAY_LOAD);
  held.rejects[0]?.(new Error('503'));
  assert.equal(await warm, null);
  assert.equal(await play, 'decoded4');
  assert.equal(eight.urls.length, 2);
});

void test('if that retry fails too the failure is remembered like any play failure', async (): Promise<void> => {
  const nine: Rig = rig('http://localhost:5210/');
  const held: Gate = gate();
  nine.behaviours.push(held.behave, FAIL);
  const warm: Promise<string | null> = nine.loader.load('a/one_1.ogg', WARM_LOAD);
  const play: Promise<string | null> = nine.loader.load('a/one_1.ogg', PLAY_LOAD);
  held.rejects[0]?.(new Error('503'));
  assert.equal(await warm, null);
  assert.equal(await play, null);
  assert.equal(nine.urls.length, 2);
  assert.equal(await nine.loader.load('a/one_1.ogg', PLAY_LOAD), null);
  assert.equal(nine.urls.length, 2);
});

void test('a play that joined a warm-up which succeeds shares its result without a second fetch', async (): Promise<void> => {
  const ten: Rig = rig('http://localhost:5210/');
  const held: Gate = gate();
  ten.behaviours.push(held.behave);
  const warm: Promise<string | null> = ten.loader.load('a/one_1.ogg', WARM_LOAD);
  const play: Promise<string | null> = ten.loader.load('a/one_1.ogg', PLAY_LOAD);
  held.resolves[0]?.(new ArrayBuffer(7));
  assert.deepEqual(await Promise.all([warm, play]), ['decoded7', 'decoded7']);
  assert.equal(ten.urls.length, 1);
});

void test('a play that joined a failing play does not fetch again, and a warm-up that joined a play shares it', async (): Promise<void> => {
  const eleven: Rig = rig('http://localhost:5210/');
  const held: Gate = gate();
  eleven.behaviours.push(held.behave);
  const first: Promise<string | null> = eleven.loader.load('a/one_1.ogg', PLAY_LOAD);
  const second: Promise<string | null> = eleven.loader.load('a/one_1.ogg', PLAY_LOAD);
  const warm: Promise<string | null> = eleven.loader.load('a/one_1.ogg', WARM_LOAD);
  held.rejects[0]?.(new Error('503'));
  assert.deepEqual(await Promise.all([first, second, warm]), [null, null, null]);
  assert.equal(eleven.urls.length, 1);
});

void test('every finished load reports whether the sound file arrived', async (): Promise<void> => {
  const outcomes: boolean[] = [];
  const answers: Promise<ArrayBuffer>[] = [Promise.reject(new Error('503')), Promise.resolve(new ArrayBuffer(4))];
  const loader: BufferLoader<string> = createBufferLoader<string>({
    base: 'http://localhost:5210/',
    clock: (): number => 0,
    cache: createBufferCache<string>(1000, (value: string): number => value.length),
    failedRetrySeconds: 30,
    timeoutMs: 30,
    ready: (): boolean => true,
    fetchBytes: (): Promise<ArrayBuffer> => answers.shift() ?? Promise.resolve(new ArrayBuffer(4)),
    decode: (bytes: ArrayBuffer): Promise<string> => Promise.resolve(`decoded${bytes.byteLength}`),
    onOutcome: (ok: boolean): void => {
      outcomes.push(ok);
    },
  });
  assert.equal(await loader.load('a.ogg'), null);
  assert.equal(await loader.load('b.ogg'), 'decoded4');
  assert.deepEqual(outcomes, [false, true]);
});
