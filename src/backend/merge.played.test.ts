import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeSave } from '../../test/backend-support.ts';
import type { SaveData } from '../../sim/save.ts';
import type { CloudState } from './api.ts';
import { chooseOnConflict, chooseOnLoad, compareProgress, describe } from './merge.ts';
import type { SyncRecord } from './sync-record.ts';

const EARLY: string = '2026-11-11T09:00:00.000Z';
const LATE: string = '2026-11-11T10:00:00.000Z';

function played(level: number, xp: number, seconds: number): SaveData {
  const save: SaveData = makeSave(level, xp);
  return { ...save, tally: { ...save.tally, played: seconds } };
}

function pending(savedAt: string): SyncRecord {
  return { serverUrl: 'http://x', accountId: 'a', token: 't', revision: 3, updatedAt: EARLY, savedAt, pending: true, overwriteCloud: false };
}

function cloud(save: SaveData, updatedAt: string): CloudState {
  return { save, revision: 4, updatedAt, epoch: 2 };
}

void test('at the same level and experience the copy played longer is further along', (): void => {
  assert.ok(compareProgress(played(1, 0, 40), played(1, 0, 20)) > 0);
  assert.ok(compareProgress(played(1, 0, 20), played(1, 0, 40)) < 0);
  assert.ok(compareProgress(played(2, 0, 1), played(1, 0, 900)) > 0);
  assert.ok(compareProgress(played(1, 10, 1), played(1, 5, 900)) > 0);
  assert.match(describe(played(1, 0, 40.7)), /40 s played/);
});

void test('on load, an older cloud copy that landed after the newest device save loses to the device when it was played less', (): void => {
  assert.equal(chooseOnLoad({ local: played(1, 0, 40), record: pending(EARLY), cloud: cloud(played(1, 0, 20), LATE) }).side, 'local');
  assert.equal(chooseOnLoad({ local: played(1, 0, 20), record: pending(LATE), cloud: cloud(played(1, 0, 40), EARLY) }).side, 'cloud');
  assert.equal(chooseOnLoad({ local: played(1, 0, 20), record: pending(EARLY), cloud: cloud(played(1, 0, 20), LATE) }).side, 'cloud');
});

void test('on a conflict at the same level and experience the copy played longer is kept', (): void => {
  assert.equal(chooseOnConflict({ local: played(1, 0, 40), current: cloud(played(1, 0, 20), LATE), overwriteCloud: false }).side, 'local');
  assert.equal(chooseOnConflict({ local: played(1, 0, 20), current: cloud(played(1, 0, 40), LATE), overwriteCloud: false }).side, 'cloud');
});
