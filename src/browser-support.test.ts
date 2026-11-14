import assert from 'node:assert/strict';
import test from 'node:test';
import type { RetryStore } from './browser-support.ts';
import { BROWSER_NOTICES, claimRetry, createdOrUnsupported, failureText, probeBrowser, reloadHelps, RETRY, sessionStore, UnsupportedBrowser, unsupportedReason } from './browser-support.ts';

void test('a modern browser with WebGL 2 has nothing to say', (): void => {
  assert.equal(unsupportedReason({ webgl2: true, modernArrays: true }), null);
  assert.equal(unsupportedReason(probeBrowser({ WebGL2RenderingContext: Object }, Array.prototype)), null);
});

void test('a browser without WebGL 2 or without the array methods the game uses is told so plainly', (): void => {
  assert.equal(unsupportedReason({ webgl2: false, modernArrays: true }), BROWSER_NOTICES.webgl);
  assert.equal(unsupportedReason({ webgl2: true, modernArrays: false }), BROWSER_NOTICES.old);
  assert.equal(unsupportedReason(probeBrowser({}, Array.prototype)), BROWSER_NOTICES.webgl);
  assert.equal(unsupportedReason(probeBrowser({ WebGL2RenderingContext: Object }, { at: true, findLast: true })), BROWSER_NOTICES.old);
});

void test('a renderer that cannot be created reads as a WebGL notice, and any other failure reads as one calm sentence with a reload', (): void => {
  assert.throws(
    (): never => createdOrUnsupported((): never => {
      throw new Error('Error creating WebGL context.');
    }),
    (error: unknown): boolean => error instanceof UnsupportedBrowser && failureText(error) === BROWSER_NOTICES.webgl,
  );
  assert.equal(createdOrUnsupported((): number => 7), 7);
  assert.equal(failureText(new Error('models/rig.glb stopped loading')), BROWSER_NOTICES.stopped);
  assert.equal(failureText('x'), BROWSER_NOTICES.stopped);
  assert.equal(reloadHelps(new Error('404')), true);
  assert.equal(reloadHelps(new UnsupportedBrowser(BROWSER_NOTICES.webgl)), false);
});

function memoryStore(): RetryStore & { readonly held: Map<string, string> } {
  const held: Map<string, string> = new Map<string, string>();
  return { held, getItem: (key: string): string | null => held.get(key) ?? null, setItem: (key: string, value: string): void => void held.set(key, value) };
}

void test('a failed start is retried once, and not again until the gap has passed', (): void => {
  const store = memoryStore();
  assert.equal(claimRetry(store, 1_000), true);
  assert.equal(store.held.get(RETRY.key), '1000');
  assert.equal(claimRetry(store, 1_000 + RETRY.gapMs - 1), false);
  assert.equal(claimRetry(store, 1_000 + RETRY.gapMs), true);
});

void test('a browser that refuses storage shows the failure instead of reloading for ever', (): void => {
  const refusing: RetryStore = {
    getItem: (): string | null => {
      throw new Error('denied');
    },
    setItem: (): void => {
      throw new Error('denied');
    },
  };
  assert.equal(claimRetry(refusing, 1_000), false);
  assert.equal(claimRetry(null, 1_000), false);
  const guarded = {
    get sessionStorage(): RetryStore {
      throw new Error('denied');
    },
  };
  assert.equal(sessionStore(guarded), null);
  const open = memoryStore();
  assert.equal(sessionStore({ sessionStorage: open }), open);
});
