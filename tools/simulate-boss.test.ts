import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BossOutcome, Measurement } from '../sim/measure.ts';
import type { BossRow } from './simulate-boss.ts';
import { bossAttempts, bossRows, bossTable } from './simulate-boss.ts';

function fight(level: number, outcome: BossOutcome, seconds: number, lifeLeft: number): Measurement {
  return { kind: 'boss', t: 0, boss: 'keeper', level, outcome, seconds, lifeLeft };
}

function stream(policy: string, fights: readonly Measurement[]): Measurement[] {
  return [{ kind: 'session', t: 0, version: 1, source: 'sim', scenario: 'boss at 8', policy, seed: 1 }, ...fights];
}

void test('boss attempts carry the policy of their run, and rows count wins, timeouts and life left on a win by policy and level', (): void => {
  const rows: BossRow[] = bossRows([...bossAttempts(stream('poor', [fight(8, 'lost', 20, 0), fight(8, 'timeout', 300, 0.4)])), ...bossAttempts(stream('careful', [fight(10, 'won', 90, 0.5), fight(8, 'won', 120, 0.25), fight(8, 'lost', 60, 0)]))]);
  assert.deepEqual(
    rows.map((row: BossRow): string => `${row.policy} ${row.level} ${row.attempts} ${row.winRate} ${row.timeoutRate} ${row.lifeLeft.n}`),
    ['careful 8 2 0.5 0 1', 'careful 10 1 1 0 1', 'poor 8 2 0 0.5 0'],
  );
  const table: string[] = bossTable(rows).split('\n');
  assert.equal(table.length, rows.length + 2);
  assert.match(table[4] ?? '', /\| poor \| keeper \| 8 \| 2 \| 0% \| 50% \| .* \| - \|$/);
});
