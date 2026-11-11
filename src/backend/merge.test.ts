import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeSave } from '../../test/backend-support.ts';
import type { CloudState } from './api.ts';
import { chooseOnConflict, chooseOnLoad, compareProgress } from './merge.ts';
import type { SyncRecord } from './sync-record.ts';

function record(overrides: Partial<SyncRecord> = {}): SyncRecord {
  return { serverUrl: 'http://x', accountId: 'a', token: 't', revision: 3, updatedAt: '2026-11-11T10:00:00.000Z', savedAt: '2026-11-11T10:00:00.000Z', pending: false, overwriteCloud: false, ...overrides };
}

function cloud(level: number, xp: number, revision: number, updatedAt: string = '2026-11-11T10:00:00.000Z'): CloudState {
  return { save: makeSave(level, xp), revision, updatedAt };
}

const EMPTY: CloudState = { save: null, revision: 0, updatedAt: null };

void test('progress is level first, then experience', (): void => {
  assert.ok(compareProgress(makeSave(5, 0), makeSave(4, 900)) > 0);
  assert.ok(compareProgress(makeSave(4, 10), makeSave(4, 20)) < 0);
  assert.equal(compareProgress(makeSave(4, 10), makeSave(4, 10)), 0);
});

void test('on load, an empty cloud keeps the local save and two empties start fresh', (): void => {
  assert.equal(chooseOnLoad({ local: makeSave(2, 5), record: null, cloud: EMPTY }).side, 'local');
  assert.equal(chooseOnLoad({ local: null, record: null, cloud: EMPTY }).side, 'none');
});

void test('on load, a device with no save takes the cloud save', (): void => {
  assert.equal(chooseOnLoad({ local: null, record: null, cloud: cloud(4, 0, 2) }).side, 'cloud');
});

void test('on load, a synced device follows a newer cloud revision and keeps its own when up to date', (): void => {
  assert.equal(chooseOnLoad({ local: makeSave(9, 0), record: record({ revision: 3 }), cloud: cloud(2, 0, 4) }).side, 'cloud');
  assert.equal(chooseOnLoad({ local: makeSave(2, 0), record: record({ revision: 3 }), cloud: cloud(2, 0, 3) }).side, 'local');
  assert.equal(chooseOnLoad({ local: makeSave(5, 0), record: record({ revision: 3, pending: true }), cloud: cloud(2, 0, 3) }).side, 'local');
});

void test('on load, unsynced changes against a cloud that moved are decided by level, then experience, then time', (): void => {
  const pending: SyncRecord = record({ revision: 3, pending: true });
  assert.equal(chooseOnLoad({ local: makeSave(6, 0), record: pending, cloud: cloud(5, 900, 4) }).side, 'local');
  assert.equal(chooseOnLoad({ local: makeSave(5, 100), record: pending, cloud: cloud(5, 900, 4) }).side, 'cloud');
  assert.equal(chooseOnLoad({ local: makeSave(5, 100), record: record({ revision: 3, pending: true, savedAt: '2026-11-11T11:00:00.000Z' }), cloud: cloud(5, 100, 4, '2026-11-11T10:00:00.000Z') }).side, 'local');
  assert.equal(chooseOnLoad({ local: makeSave(5, 100), record: record({ revision: 3, pending: true, savedAt: '2026-11-11T09:00:00.000Z' }), cloud: cloud(5, 100, 4, '2026-11-11T10:00:00.000Z') }).side, 'cloud');
});

void test('on load, a device that never synced is compared with the cloud by progress', (): void => {
  assert.equal(chooseOnLoad({ local: makeSave(2, 0), record: null, cloud: cloud(4, 0, 6) }).side, 'cloud');
  assert.equal(chooseOnLoad({ local: makeSave(9, 0), record: null, cloud: cloud(4, 0, 6) }).side, 'local');
});

void test('on load, a cloud that went backwards is treated as diverged, not as newer', (): void => {
  assert.equal(chooseOnLoad({ local: makeSave(8, 0), record: record({ revision: 9 }), cloud: cloud(3, 0, 2) }).side, 'local');
});

void test('on load, a reset that never reached the cloud makes the local side win', (): void => {
  const flagged: SyncRecord = record({ overwriteCloud: true });
  assert.equal(chooseOnLoad({ local: makeSave(1, 0), record: flagged, cloud: cloud(9, 0, 8) }).side, 'local');
  assert.equal(chooseOnLoad({ local: null, record: flagged, cloud: cloud(9, 0, 8) }).side, 'none');
});

void test('on a conflict the copy with the higher level and experience is kept', (): void => {
  assert.equal(chooseOnConflict({ local: makeSave(6, 0), current: cloud(5, 900, 4), overwriteCloud: false }).side, 'local');
  assert.equal(chooseOnConflict({ local: makeSave(5, 100), current: cloud(5, 900, 4), overwriteCloud: false }).side, 'cloud');
  assert.equal(chooseOnConflict({ local: makeSave(5, 900), current: cloud(5, 900, 4), overwriteCloud: false }).side, 'local');
  assert.equal(chooseOnConflict({ local: makeSave(1, 0), current: cloud(9, 0, 4), overwriteCloud: true }).side, 'local');
  assert.equal(chooseOnConflict({ local: makeSave(1, 0), current: EMPTY, overwriteCloud: false }).side, 'local');
});
