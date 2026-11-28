import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHarness, makeSave, settle, synced } from '../../test/backend-support.ts';
import type { Harness, ServerAccount } from '../../test/backend-support.ts';
import { must } from '../../test/support.ts';
import type { SaveData } from '../../sim/save.ts';
import type { StoryFlags } from '../../sim/content/story-types.ts';
import type { Backend } from './backend.ts';
import { SAVE_KEY } from './local.ts';
import { TIMING } from './remote.ts';

const BEGUN: StoryFlags = { traveller_dressed: 'yes', opening: 'begun' };
const READ: StoryFlags = { traveller_dressed: 'yes', opening: 'read', first_choice: 'took_journal' };

function opening(flags: StoryFlags, played: number): SaveData {
  const save: SaveData = makeSave(1, 0);
  return { ...save, flags, tally: { ...save.tally, played } };
}

function account(harness: Harness): ServerAccount {
  return must(harness.server.accounts[0], 'the server account');
}

function storedFlags(harness: Harness): unknown {
  const text: string | null = harness.store.read(SAVE_KEY);
  if (text === null) return null;
  const parsed: unknown = JSON.parse(text);
  return typeof parsed === 'object' && parsed !== null && 'flags' in parsed ? parsed.flags : null;
}

async function lateOlderPush(harness: Harness, backend: Backend): Promise<void> {
  backend.save(opening(BEGUN, 20));
  const release: () => void = harness.server.holdNext();
  await harness.timers.advance(TIMING.routinePushMs);
  harness.clock.now += 3000;
  backend.save(opening(READ, 40));
  backend.flush();
  harness.clock.now += 500;
  harness.server.loseNextAnswer('PUT', '/v1/save');
  release();
  await settle();
  await settle();
}

void test('a reload in the opening keeps the journal and the page when an older push lands after the newest save and its answer is lost', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = await synced(harness, 1);
  await lateOlderPush(harness, backend);
  assert.deepEqual(account(harness).save?.flags, BEGUN);
  const loaded: SaveData | null = await harness.open().load();
  assert.deepEqual(loaded?.flags, READ);
  assert.deepEqual(storedFlags(harness), READ);
  await harness.timers.advance(0);
  assert.deepEqual(account(harness).save?.flags, READ);
});

void test('at the same level and experience a cloud copy played longer elsewhere still wins the reload', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = await synced(harness, 1);
  await lateOlderPush(harness, backend);
  harness.server.plant(account(harness), opening({ ...READ, first_blade: 'found' }, 90));
  const loaded: SaveData | null = await harness.open().load();
  assert.equal(loaded?.flags['first_blade'], 'found');
});
