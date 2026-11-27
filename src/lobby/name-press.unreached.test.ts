import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NAME_MESSAGES } from './lobby-model.ts';
import { unreachedStep } from './name-press.ts';

void test('a name the server could not hear is first held open with a warning, and kept on the device only when Enter is pressed again', (): void => {
  assert.equal(unreachedStep(false), 'warn');
  assert.equal(unreachedStep(true), 'keep');
  assert.match(NAME_MESSAGES.unreached, /Press Enter again/);
});
