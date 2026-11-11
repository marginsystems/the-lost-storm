import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ManifestLoader } from './manifest-loader.ts';
import { createManifestLoader } from './manifest-loader.ts';

const GOOD: unknown = { sfx: { bone_hit: ['a.ogg'] }, voice: {} };

interface Rig {
  readonly loader: ManifestLoader;
  readonly urls: string[];
  advance(seconds: number): void;
  answers: (() => Promise<unknown>)[];
}

function rig(base: string | null): Rig {
  const urls: string[] = [];
  let now: number = 100;
  const state: Rig = {
    urls,
    answers: [],
    advance(seconds: number): void {
      now += seconds;
    },
    loader: createManifestLoader({
      base,
      clock: (): number => now,
      retrySeconds: 10,
      fetchJson: (url: string): Promise<unknown> => {
        urls.push(url);
        const answer: (() => Promise<unknown>) | undefined = state.answers.shift();
        return answer === undefined ? Promise.resolve(GOOD) : answer();
      },
    }),
  };
  return state;
}

void test('with no base nothing is ever requested', async (): Promise<void> => {
  const test1: Rig = rig(null);
  test1.loader.ensure();
  await test1.loader.ready();
  test1.advance(100);
  test1.loader.ensure();
  assert.deepEqual(test1.urls, []);
  assert.equal(test1.loader.current(), null);
});

void test('the first ensure fetches the manifest once and tells listeners', async (): Promise<void> => {
  const test2: Rig = rig('http://localhost:5210/');
  const heard: number[] = [];
  test2.loader.onLoaded((manifest): void => {
    heard.push(manifest.sfx.size);
  });
  test2.loader.ensure();
  test2.loader.ensure();
  await test2.loader.ready();
  test2.loader.ensure();
  assert.deepEqual(test2.urls, ['http://localhost:5210/manifest.json']);
  assert.deepEqual(heard, [1]);
  assert.equal(test2.loader.current()?.sfx.get('bone_hit')?.[0], 'a.ogg');
});

void test('a failed fetch is retried only after the interval, and a later success is announced', async (): Promise<void> => {
  const test3: Rig = rig('http://localhost:5210/');
  test3.answers = [(): Promise<unknown> => Promise.reject(new Error('server not up'))];
  const heard: number[] = [];
  test3.loader.onLoaded((): void => {
    heard.push(1);
  });
  test3.loader.ensure();
  await test3.loader.ready();
  assert.equal(test3.loader.current(), null);
  test3.advance(9);
  test3.loader.ensure();
  await test3.loader.ready();
  assert.equal(test3.urls.length, 1);
  test3.advance(1);
  test3.loader.ensure();
  await test3.loader.ready();
  assert.equal(test3.urls.length, 2);
  assert.notEqual(test3.loader.current(), null);
  assert.deepEqual(heard, [1]);
  test3.advance(100);
  test3.loader.ensure();
  assert.equal(test3.urls.length, 2);
});

void test('an unreadable manifest counts as a failure and is retried the same way', async (): Promise<void> => {
  const test4: Rig = rig('http://localhost:5210/');
  test4.answers = [(): Promise<unknown> => Promise.resolve({ nothing: true }), (): Promise<unknown> => Promise.resolve('text')];
  test4.loader.ensure();
  await test4.loader.ready();
  assert.equal(test4.loader.current(), null);
  test4.advance(10);
  test4.loader.ensure();
  await test4.loader.ready();
  assert.equal(test4.loader.current(), null);
  test4.advance(10);
  test4.loader.ensure();
  await test4.loader.ready();
  assert.notEqual(test4.loader.current(), null);
  assert.equal(test4.urls.length, 3);
});

void test('a fetch that throws at once does not leave the loader stuck', async (): Promise<void> => {
  const test5: Rig = rig('http://localhost:5210/');
  test5.answers = [
    (): Promise<unknown> => {
      throw new Error('sync failure');
    },
  ];
  test5.loader.ensure();
  await test5.loader.ready();
  test5.advance(10);
  test5.loader.ensure();
  await test5.loader.ready();
  assert.notEqual(test5.loader.current(), null);
});

void test('while a fetch is in flight no second one starts', async (): Promise<void> => {
  const test6: Rig = rig('http://localhost:5210/');
  const releases: ((value: unknown) => void)[] = [];
  test6.answers = [
    (): Promise<unknown> =>
      new Promise<unknown>((resolve: (value: unknown) => void): void => {
        releases.push(resolve);
      }),
  ];
  test6.loader.ensure();
  test6.advance(50);
  test6.loader.ensure();
  assert.equal(test6.urls.length, 1);
  releases[0]?.(GOOD);
  await test6.loader.ready();
  assert.notEqual(test6.loader.current(), null);
});
