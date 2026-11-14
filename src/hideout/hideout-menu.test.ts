import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ReportResult } from '../backend/api.ts';
import { reportNote } from './hideout-menu.ts';

void test('every report answer has its own line in the menu', (): void => {
  const results: readonly ReportResult[] = ['reported', 'gone', 'own', 'slow', 'unsupported', 'failed'];
  const notes: ReadonlySet<string> = new Set<string>(results.map(reportNote));
  assert.equal(notes.size, results.length);
  assert.equal(reportNote('reported'), 'Reported. Thank you.');
});
