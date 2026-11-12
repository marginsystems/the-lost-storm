import assert from 'node:assert/strict';
import test from 'node:test';
import { BROWSER_NOTICES, createdOrUnsupported, failureText, probeBrowser, reloadHelps, UnsupportedBrowser, unsupportedReason } from './browser-support.ts';

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
