import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Measurement } from '../sim/measure.ts';
import { readStream, sessionHeader, toLine } from '../sim/measure.ts';
import type { BuildRow } from './simulate-builds.ts';
import { buildRows, buildTable } from './simulate-builds.ts';
import type { RunSummary } from './simulate-summary.ts';
import { summarize } from './simulate-summary.ts';

const RANKS: readonly string[] = ['normal', 'magic', 'rare'];

function stream(build: string, seed: number, lateLevel: number): Measurement[] {
  return [
    sessionHeader('sim', 'level 20', `average/${build}`, seed),
    { kind: 'level', t: 60, level: 2 },
    { kind: 'level', t: 600, level: 5 },
    { kind: 'level', t: lateLevel, level: 10 },
    { kind: 'fight', t: 100, id: 1, moment: 'charge', level: 4, foes: 3, rank: 'magic' },
    { kind: 'hit', t: 101, taken: false, amount: 300, foe: 'unfinished_borrower', skill: 'cleave', zone: 'hall_of_time', fight: null },
    { kind: 'hit', t: 102, taken: true, amount: 25, foe: 'unfinished_borrower', skill: 'borrower_cleave', zone: 'hall_of_time', fight: null },
    { kind: 'kill', t: 105, foe: 'unfinished_borrower' },
    { kind: 'kill', t: 106, foe: 'mended' },
    { kind: 'moment', t: 110, id: 1, moment: 'charge', outcome: 'resolved' },
    { kind: 'low', t: 150, seconds: 12 },
    { kind: 'death', t: 200, zone: 'hall_of_time', foe: 'unfinished_borrower', skill: 'borrower_cleave', xpLost: 40 },
    { kind: 'end', t: 1200, reason: 'done' },
  ];
}

void test('a stream carries kills, time below a third of life and the experience a death cost', (): void => {
  const run: RunSummary = summarize(stream('glass', 1, 900));
  assert.equal(run.kills, 2);
  assert.equal(run.lowSeconds, 12);
  assert.deepEqual(run.deaths.map((death): number => death.xpLost), [40]);
  assert.deepEqual(run.deaths.map((death): number => death.level), [10]);
  const again: Measurement[] = readStream(stream('glass', 1, 900).map(toLine).join('\n'));
  assert.deepEqual(again, stream('glass', 1, 900));
});

void test('a build row is the spread over its seeds, with the level times, the rates and the fights by pack rank', (): void => {
  const runs: RunSummary[] = [stream('glass', 1, 900), stream('glass', 2, 1000), stream('tank', 1, 1100)].map(summarize);
  const rows: BuildRow[] = buildRows(runs, RANKS);
  assert.deepEqual(rows.map((row: BuildRow): string => row.build), ['average/glass', 'average/tank']);
  const glass: BuildRow | undefined = rows[0];
  assert.ok(glass !== undefined);
  assert.equal(glass.runs, 2);
  const ten = glass.levels.find((entry): boolean => entry.level === 10);
  assert.equal(ten?.share, 1);
  assert.equal(ten.seconds.median, 950);
  const twenty = glass.levels.find((entry): boolean => entry.level === 20);
  assert.equal(twenty?.share, 0);
  assert.ok(Math.abs(glass.killsPerMinute.median - 0.1) < 1e-9);
  assert.equal(glass.deathsPerHour.median, 3);
  assert.equal(glass.xpLostPerHour.median, 120);
  assert.equal(glass.fightDps.median, 30);
  assert.deepEqual(glass.ranks.map((entry): string => entry.rank), RANKS);
  const magic = glass.ranks.find((entry): boolean => entry.rank === 'magic');
  assert.equal(magic?.fights, 2);
  assert.equal(magic.clearRate, 1);
  assert.equal(magic.deathRate, 0);
  assert.equal(glass.ranks.find((entry): boolean => entry.rank === 'rare')?.fights, 0);
  assert.ok(Math.abs(glass.lowShare.median - 0.01) < 1e-9);
});

void test('the table has a line for each build in each of its two parts', (): void => {
  const rows: BuildRow[] = buildRows([stream('glass', 1, 900), stream('tank', 1, 1100)].map(summarize), RANKS);
  const lines: string[] = buildTable(rows).split('\n');
  assert.equal(lines.filter((line: string): boolean => line.includes('average/glass')).length, 2);
  assert.equal(lines.filter((line: string): boolean => line.includes('average/tank')).length, 2);
  assert.ok(lines.some((line: string): boolean => line.includes('L20 time')));
});

void test('a rank whose fights were never cleared shows no clear time instead of zero seconds', (): void => {
  const lost: Measurement[] = [
    sessionHeader('sim', 'level 20', 'average/glass', 1),
    { kind: 'fight', t: 10, id: 1, moment: 'charge', level: 4, foes: 3, rank: 'rare' },
    { kind: 'moment', t: 40, id: 1, moment: 'charge', outcome: 'expired' },
    { kind: 'end', t: 100, reason: 'done' },
  ];
  const lines: string[] = buildTable(buildRows([summarize(lost)], RANKS)).split('\n');
  const row: string | undefined = lines.filter((line: string): boolean => line.includes('average/glass')).at(1);
  assert.ok(row !== undefined && row.includes('0% clear, 0% die, -, took 0'), row);
});
