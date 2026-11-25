import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Content } from '../sim/content/types.ts';
import type { FarmRun, PaceRow } from './level-pace.ts';
import { bandMinutes, bandRatio, farmRun, LEVEL_PACE, paceRow, withinTolerance, withXpBeyond } from './level-pace.ts';
import { POLICIES } from './simulate-policies.ts';
import { CONTENT } from './simulate-run.ts';
import { xpToNextLevel } from '../sim/progression.ts';
import { monsterXpScale } from '../sim/world/monster-xp.ts';

function row(level: number, minutes: number): PaceRow {
  return { level, runs: 1, xpPerMinute: 0, killsPerLevel: 0, minutes, deaths: 0 };
}

void test('a level that needs twice the experience a minute brings takes twice the minutes', (): void => {
  const level: number = 25;
  const need: number = xpToNextLevel(CONTENT.player.xp, level);
  const scale: number = monsterXpScale(CONTENT.world.scaling, level);
  const run: FarmRun = { level, seconds: 120, base: need / scale, kills: 40, deaths: 0 };
  const one: PaceRow = paceRow(CONTENT, level, [run]);
  assert.equal(Math.round(one.minutes * 1000), 2000);
  assert.equal(Math.round(one.killsPerLevel), 40);
  const half: PaceRow = paceRow(CONTENT, level, [{ ...run, base: run.base / 2 }]);
  assert.equal(Math.round(half.minutes * 1000), 4000);
});

void test('a band is the mean of its rows from its first level up to but not including its last', (): void => {
  const rows: readonly PaceRow[] = [row(20, 10), row(25, 20), row(30, 90), row(35, 30)];
  assert.equal(bandMinutes(rows, { from: 20, to: 30 }), 15);
  assert.equal(bandRatio(rows, { from: 20, to: 30 }, { from: 30, to: 40 }), 4);
  assert.equal(withinTolerance(1.3, 1 / 3), true);
  assert.equal(withinTolerance(1.4, 1 / 3), false);
  assert.equal(withinTolerance(0.6, 1 / 3), false);
});

void test('the rule above the old cap can be taken off a world to see the pace without it', (): void => {
  const plain = withXpBeyond(CONTENT, null);
  assert.equal(plain.world.scaling.xpBeyond, null);
  assert.ok(monsterXpScale(CONTENT.world.scaling, 40) > monsterXpScale(plain.world.scaling, 40));
});

void test('a geared hero farming a zone scaled to level 40 kills monsters and earns experience on the fake clock', (): void => {
  const run: FarmRun = farmRun(CONTENT, POLICIES, 40, 'glass', 1, 0.5);
  assert.ok(run.kills > 0);
  assert.ok(run.base > 0);
  assert.ok(run.seconds > 0 && run.seconds < 60);
});

function measuredRows(content: Content): PaceRow[] {
  return MEASURED.map(([level, base, kills]: readonly [number, number, number]): PaceRow => paceRow(content, level, [{ level, seconds: 60, base, kills, deaths: 0 }]));
}

function silent(): FarmRun[] {
  return [{ level: 25, seconds: 60, base: 0, kills: 3, deaths: 0 }];
}

void test('a level where no run earned experience takes forever instead of no time', (): void => {
  assert.equal(paceRow(CONTENT, 25, silent()).minutes, Number.POSITIVE_INFINITY);
});

const MEASURED: readonly (readonly [number, number, number])[] = [
  [20, 156, 5.7], [22, 172, 5.96], [24, 154, 5.28], [26, 171, 6], [28, 214, 6.84], [30, 152, 5.61], [32, 248, 7.29], [34, 178, 5.63],
  [36, 155, 5.72], [38, 201, 5.6], [40, 167, 5.31], [42, 145, 4.87], [44, 193, 5.46], [46, 168, 5.61], [48, 181, 6.08],
];

void test('with experience yields recorded from the farming tool at the commit that landed this rule, levels 30 to 50 take about as long as 20 to 30 and the old rule would not', (): void => {
  for (const band of LEVEL_PACE.bands) {
    const ratio: number = bandRatio(measuredRows(CONTENT), LEVEL_PACE.reference, band);
    assert.ok(withinTolerance(ratio, LEVEL_PACE.tolerance), `levels ${band.from} to ${band.to} take ${Math.round(ratio * 100) / 100} times as long as 20 to 30`);
    assert.equal(withinTolerance(bandRatio(measuredRows(withXpBeyond(CONTENT, null)), LEVEL_PACE.reference, band), LEVEL_PACE.tolerance), false);
  }
});
