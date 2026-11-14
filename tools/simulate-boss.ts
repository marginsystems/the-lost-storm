import type { BossOutcome, Measurement } from '../sim/measure.ts';
import type { Spread } from './simulate-summary.ts';
import { spread } from './simulate-summary.ts';

export interface BossAttempt {
  readonly policy: string;
  readonly boss: string;
  readonly level: number;
  readonly outcome: BossOutcome;
  readonly seconds: number;
  readonly lifeLeft: number;
}

export interface BossRow {
  readonly policy: string;
  readonly boss: string;
  readonly level: number;
  readonly attempts: number;
  readonly winRate: number;
  readonly timeoutRate: number;
  readonly seconds: Spread;
  readonly lifeLeft: Spread;
}

export function bossAttempts(stream: readonly Measurement[]): BossAttempt[] {
  let policy: string = 'unknown';
  const attempts: BossAttempt[] = [];
  for (const entry of stream) {
    if (entry.kind === 'session') policy = entry.policy;
    if (entry.kind === 'boss') attempts.push({ policy, boss: entry.boss, level: entry.level, outcome: entry.outcome, seconds: entry.seconds, lifeLeft: entry.lifeLeft });
  }
  return attempts;
}

export function bossRows(attempts: readonly BossAttempt[]): BossRow[] {
  const groups: Map<string, BossAttempt[]> = new Map<string, BossAttempt[]>();
  for (const attempt of attempts) {
    const key: string = `${attempt.policy}\u0000${attempt.boss}\u0000${attempt.level}`;
    groups.set(key, [...(groups.get(key) ?? []), attempt]);
  }
  return [...groups.values()]
    .map((group: readonly BossAttempt[]): BossRow => {
      const first: BossAttempt | undefined = group[0];
      const won: readonly BossAttempt[] = group.filter((attempt: BossAttempt): boolean => attempt.outcome === 'won');
      return {
        policy: first?.policy ?? 'unknown',
        boss: first?.boss ?? 'unknown',
        level: first?.level ?? 0,
        attempts: group.length,
        winRate: won.length / group.length,
        timeoutRate: group.filter((attempt: BossAttempt): boolean => attempt.outcome === 'timeout').length / group.length,
        seconds: spread(group.map((attempt: BossAttempt): number => attempt.seconds)),
        lifeLeft: spread(won.map((attempt: BossAttempt): number => attempt.lifeLeft)),
      };
    })
    .toSorted((a: BossRow, b: BossRow): number => (a.policy === b.policy ? a.level - b.level : a.policy.localeCompare(b.policy)));
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function seconds(value: Spread): string {
  return `${Math.round(value.median)} s [${Math.round(value.p10)}-${Math.round(value.p90)}]`;
}

export function bossTable(rows: readonly BossRow[]): string {
  const head: string = '| policy | boss | level | attempts | won | timed out | fight length | life left on a win |\n| --- | --- | --- | --- | --- | --- | --- | --- |';
  const body: string[] = rows.map((row: BossRow): string => `| ${row.policy} | ${row.boss} | ${row.level} | ${row.attempts} | ${percent(row.winRate)} | ${percent(row.timeoutRate)} | ${seconds(row.seconds)} | ${row.lifeLeft.n === 0 ? '-' : percent(row.lifeLeft.median)} |`);
  return [head, ...body].join('\n');
}
