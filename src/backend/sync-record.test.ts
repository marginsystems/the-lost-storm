import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSyncRecord, serializeSyncRecord } from './sync-record.ts';
import type { SyncRecord } from './sync-record.ts';

const URL_A: string = 'http://localhost:8787';
const RECORD: SyncRecord = { serverUrl: URL_A, accountId: 'acct', token: 'secret', revision: 4, updatedAt: '2026-11-11T10:00:00.000Z', savedAt: null, pending: true, overwriteCloud: false };

void test('a record survives being written and read back', (): void => {
  assert.deepEqual(parseSyncRecord(serializeSyncRecord(RECORD), URL_A), RECORD);
});

void test('a record for another server is ignored, so its token is never sent there', (): void => {
  assert.equal(parseSyncRecord(serializeSyncRecord(RECORD), 'http://localhost:9999'), null);
});

void test('anything that is not a well formed record reads as no record', (): void => {
  const broken: readonly string[] = [
    '',
    'not json',
    '[]',
    'null',
    JSON.stringify({ ...RECORD, token: '' }),
    JSON.stringify({ ...RECORD, token: 5 }),
    JSON.stringify({ ...RECORD, revision: -1 }),
    JSON.stringify({ ...RECORD, revision: 1.5 }),
    JSON.stringify({ ...RECORD, revision: '4' }),
    JSON.stringify({ ...RECORD, pending: 'yes' }),
    JSON.stringify({ ...RECORD, overwriteCloud: null }),
    JSON.stringify({ ...RECORD, updatedAt: 5 }),
    JSON.stringify({ serverUrl: URL_A }),
  ];
  for (const text of broken) assert.equal(parseSyncRecord(text, URL_A), null, text);
  assert.equal(parseSyncRecord(null, URL_A), null);
});
