import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Measurement } from '../sim/measure.ts';
import { sessionHeader } from '../sim/measure.ts';
import type { Report, RunSummary } from './simulate-summary.ts';
import { buildReport, percentile, spread, summarize, topRarity } from './simulate-summary.ts';
import { CONTENT } from './simulate-run.ts';

const RULES = { rare: 'rare', windows: [1, 2], sampleMinutes: 1 } as const;

function stream(policy: string, seed: number, rare: boolean): Measurement[] {
  return [
    sessionHeader('sim', 'farm 2m', policy, seed),
    { kind: 'milestone', t: 5, name: 'reached_hall' },
    { kind: 'level', t: 10, level: 2 },
    { kind: 'fight', t: 20, id: 1, moment: 'campfire', level: 1, foes: 2 },
    { kind: 'hit', t: 21, taken: true, amount: 12, foe: 'mended', skill: 'mended_rhythm', zone: 'hall_of_time', fight: null },
    { kind: 'flask', t: 22, flask: 'life_flask' },
    { kind: 'hit', t: 23, taken: false, amount: 40, foe: 'mended', skill: 'cleave', zone: 'hall_of_time', fight: null },
    { kind: 'moment', t: 26, id: 1, moment: 'campfire', outcome: 'resolved' },
    { kind: 'drop', t: 26, base: 'rusted_blade', slot: 'weapon', rarity: rare ? 'rare' : 'common', level: 1 },
    { kind: 'gold', t: 27, amount: 30 },
    { kind: 'xp', t: 27, amount: 60 },
    { kind: 'moment', t: 50, id: 2, moment: 'charge', outcome: 'expired' },
    { kind: 'chart', t: 10, place: 'first_echo', path: 'echo', points: 1 },
    { kind: 'power', t: 0, dps: 20, toughness: 100, itemLevels: 1 },
    { kind: 'end', t: 120, reason: 'done' },
  ];
}

void test('percentiles and spreads interpolate between ranks', (): void => {
  assert.equal(percentile([], 0.5), 0);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
  assert.deepEqual(spread([4, 1, 3, 2]), { n: 4, mean: 2.5, median: 2.5, p10: 1.3, p90: 3.7 });
});

void test('a run summary attributes hits and flasks to the fight that was open', (): void => {
  const run: RunSummary = summarize(stream('average/mixed', 1, true));
  assert.equal(run.seconds, 120);
  assert.equal(run.reason, 'done');
  assert.deepEqual(run.fights, [{ moment: 'campfire', level: 1, seconds: 6, taken: 12, dealt: 40, flasks: 1, died: false, outcome: 'resolved' }]);
  assert.deepEqual(run.outcomes, { resolved: 1, expired: 1 });
  assert.equal(run.levels['2'], 10);
  assert.equal(run.gold, 30);
});

void test('a report gives per-minute rates, drop chances and flags a rarity that never drops or a policy that never dies', (): void => {
  const runs: RunSummary[] = [1, 2, 3, 4, 5].map((seed: number): RunSummary => summarize(stream('average/mixed', seed, seed % 2 === 0)));
  const report: Report = buildReport(CONTENT, runs, RULES);
  const policy = report.policies[0];
  assert.ok(policy !== undefined);
  assert.equal(policy.runs, 5);
  assert.equal(policy.goldPerMinute.median, 15);
  assert.equal(policy.clearedPerMinute.median, 0.5);
  assert.equal(policy.rareChance['1'], 2 / 5);
  assert.equal(policy.topChance['2'], 0);
  assert.equal(policy.moments[0]?.clearRate, 1);
  assert.ok(report.flags.some((flag: string): boolean => flag.includes('never dies')));
  assert.ok(topRarity(CONTENT) !== 'none');
});

void test('a hit inside one of two overlapping fights counts toward its own fight', (): void => {
  const run: RunSummary = summarize([
    sessionHeader('sim', 'farm 1m', 'poor/mixed', 1),
    { kind: 'fight', t: 1, id: 1, moment: 'campfire', level: 1, foes: 1 },
    { kind: 'fight', t: 2, id: 2, moment: 'charge', level: 1, foes: 1 },
    { kind: 'hit', t: 3, taken: true, amount: 9, foe: 'mended', skill: 'mended_rhythm', zone: 'hall_of_time', fight: 1 },
    { kind: 'moment', t: 4, id: 1, moment: 'campfire', outcome: 'resolved' },
    { kind: 'moment', t: 5, id: 2, moment: 'charge', outcome: 'resolved' },
  ]);
  assert.deepEqual(
    run.fights.map((fight): [string, number] => [fight.moment, fight.taken]),
    [
      ['campfire', 9],
      ['charge', 0],
    ],
  );
});
