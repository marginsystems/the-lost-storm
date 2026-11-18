import assert from 'node:assert/strict';
import { test } from 'node:test';
import { content, makeSave } from '../../test/backend-support.ts';
import { createMemoryBackend } from './memory.ts';

void test('a memory backend starts empty, keeps a save only for itself, and forgets it on reset', async (): Promise<void> => {
  const backend = createMemoryBackend(content);
  assert.equal(await backend.load(), null);
  assert.equal(backend.save(makeSave(3, 40)), true);
  assert.deepEqual(await backend.load(), makeSave(3, 40));
  assert.equal(await createMemoryBackend(content).load(), null);
  await backend.reset();
  assert.equal(await backend.load(), null);
});
