import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sessionHeader } from '../sim/measure.ts';
import { clock, reportText } from './simulate-report.ts';
import { CONTENT } from './simulate-run.ts';
import { buildReport, summarize } from './simulate-summary.ts';

void test('times read as minutes and seconds', (): void => {
  assert.equal(clock(0), '0:00');
  assert.equal(clock(95.4), '1:35');
  assert.equal(clock(-3), '0:00');
});

void test('the plain report names the scenario, each policy, its milestones and the flags', (): void => {
  const run = summarize([sessionHeader('sim', 'slice', 'poor/mixed', 1), { kind: 'milestone', t: 30, name: 'picked_journal' }, { kind: 'end', t: 60, reason: 'stuck at x' }]);
  const text: string = reportText(buildReport(CONTENT, [run], { rare: 'rare', windows: [10], sampleMinutes: 5 }));
  assert.match(text, /scenario: slice/);
  assert.match(text, /poor\/mixed/);
  assert.match(text, /picked_journal\s+0:30/);
  assert.match(text, /! poor\/mixed: 1 of 1 runs did not finish/);
});
