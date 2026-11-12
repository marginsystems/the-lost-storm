import assert from 'node:assert/strict';
import test from 'node:test';
import { dialogueHint } from './dialogue-box.ts';

void test('the dialogue hint says click on a desk and tap on a phone', (): void => {
  assert.equal(dialogueHint(false, false), 'Click to continue');
  assert.equal(dialogueHint(true, false), 'Click to close');
  assert.equal(dialogueHint(false, true), 'Tap to continue');
  assert.equal(dialogueHint(true, true), 'Tap to close');
});
