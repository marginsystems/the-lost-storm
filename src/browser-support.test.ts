import assert from 'node:assert/strict';
import test from 'node:test';
import { BROWSER_NOTICES, createdOrUnsupported, failureText, probeBrowser, UnsupportedBrowser, unsupportedReason } from './browser-support.ts';

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

void test('a renderer that cannot be created reads as a WebGL notice, and other failures keep their message', (): void => {
  assert.throws(
    (): never => createdOrUnsupported((): never => {
      throw new Error('Error creating WebGL context.');
    }),
    (error: unknown): boolean => error instanceof UnsupportedBrowser && failureText(error) === BROWSER_NOTICES.webgl,
  );
  assert.equal(createdOrUnsupported((): number => 7), 7);
  assert.equal(failureText(new Error('rig missing')), 'The storm failed to gather: rig missing');
  assert.equal(failureText('x'), 'The storm failed to gather.');
});
