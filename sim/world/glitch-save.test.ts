import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readGlitchSave } from './glitch-save.ts';

void test('glitch progress and fired triggers read back, and anything broken falls back to the start', (): void => {
  assert.deepEqual(readGlitchSave({ progress: 3, fired: ['first_seam', 4] }), { progress: 3, fired: ['first_seam'] });
  assert.deepEqual(readGlitchSave({ progress: -1, fired: 'x' }), { progress: 0, fired: [] });
  assert.deepEqual(readGlitchSave(undefined), { progress: 0, fired: [] });
});
