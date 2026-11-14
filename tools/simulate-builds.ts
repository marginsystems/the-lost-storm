import type { Fight, RunSummary, Spread } from './simulate-summary.ts';
import { spread } from './simulate-summary.ts';
import { clock } from './simulate-report.ts';

export const BUILD_TABLE = {
  levels: [5, 10, 15, 20],
} as const;

export interface ReferenceMoments {
  readonly elite: readonly string[];
  readonly pack: readonly string[];
}

export interface Reference {
  readonly fights: number;
  readonly clearRate: number;
  readonly deathRate: number;
  readonly seconds: Spread;
  readonly taken: Spread;
}

export interface LevelTime {
  readonly level: number;
  readonly share: number;
  readonly seconds: Spread;
}

export interface BuildRow {
  readonly build: string;
  readonly runs: number;
  readonly levels: readonly LevelTime[];
  readonly endLevel: Spread;
  readonly killsPerMinute: Spread;
  readonly fightDps: Spread;
  readonly takenPerMinute: Spread;
  readonly deathsPerHour: Spread;
  readonly xpLostPerHour: Spread;
  readonly lowShare: Spread;
  readonly elite: Reference;
  readonly pack: Reference;
}

function perMinute(runs: readonly RunSummary[], value: (run: RunSummary) => number): Spread {
  return spread(runs.filter((run: RunSummary): boolean => run.seconds > 0).map((run: RunSummary): number => value(run) / (run.seconds / 60)));
}

function sum(values: readonly number[]): number {
  return values.reduce((total: number, value: number): number => total + value, 0);
}

function fightDps(run: RunSummary): number | null {
  const seconds: number = sum(run.fights.map((fight: Fight): number => fight.seconds));
  return seconds <= 0 ? null : sum(run.fights.map((fight: Fight): number => fight.dealt)) / seconds;
}

function referenceOf(runs: readonly RunSummary[], moments: readonly string[]): Reference {
  const fights: Fight[] = runs.flatMap((run: RunSummary): Fight[] => run.fights.filter((fight: Fight): boolean => moments.includes(fight.moment)));
  const cleared: Fight[] = fights.filter((fight: Fight): boolean => fight.outcome === 'resolved');
  return {
    fights: fights.length,
    clearRate: fights.length === 0 ? 0 : cleared.length / fights.length,
    deathRate: fights.length === 0 ? 0 : fights.filter((fight: Fight): boolean => fight.died).length / fights.length,
    seconds: spread(cleared.map((fight: Fight): number => fight.seconds)),
    taken: spread(fights.map((fight: Fight): number => fight.taken)),
  };
}

export function buildRow(build: string, runs: readonly RunSummary[], reference: ReferenceMoments): BuildRow {
  return {
    build,
    runs: runs.length,
    levels: BUILD_TABLE.levels.map((level: number): LevelTime => {
      const times: number[] = runs.flatMap((run: RunSummary): number[] => {
        const t: number | undefined = run.levels[String(level)];
        return t === undefined ? [] : [t];
      });
      return { level, share: runs.length === 0 ? 0 : times.length / runs.length, seconds: spread(times) };
    }),
    endLevel: spread(runs.map((run: RunSummary): number => run.endLevel)),
    killsPerMinute: perMinute(runs, (run: RunSummary): number => run.kills),
    fightDps: spread(runs.flatMap((run: RunSummary): number[] => {
      const dps: number | null = fightDps(run);
      return dps === null ? [] : [dps];
    })),
    takenPerMinute: perMinute(runs, (run: RunSummary): number => sum(Object.values(run.takenByFoe))),
    deathsPerHour: perMinute(runs, (run: RunSummary): number => run.deaths.length * 60),
    xpLostPerHour: perMinute(runs, (run: RunSummary): number => sum(run.deaths.map((death): number => death.xpLost)) * 60),
    lowShare: spread(runs.filter((run: RunSummary): boolean => run.seconds > 0).map((run: RunSummary): number => run.lowSeconds / run.seconds)),
    elite: referenceOf(runs, reference.elite),
    pack: referenceOf(runs, reference.pack),
  };
}

export function buildRows(runs: readonly RunSummary[], reference: ReferenceMoments): BuildRow[] {
  const names: string[] = [...new Set<string>(runs.map((run: RunSummary): string => run.policy))];
  return names.map((name: string): BuildRow => buildRow(name, runs.filter((run: RunSummary): boolean => run.policy === name), reference));
}

function fixed(value: number, digits: number): string {
  return value.toFixed(digits);
}

function range(value: Spread, show: (number: number) => string): string {
  return value.n === 0 ? '-' : `${show(value.median)} [${show(value.p10)}-${show(value.p90)}]`;
}

function levelCell(entry: LevelTime | undefined): string {
  if (entry === undefined || entry.share === 0) return '-';
  return `${range(entry.seconds, clock)}${entry.share < 1 ? ` ${Math.round(entry.share * 100)}%` : ''}`;
}

function referenceCell(reference: Reference): string {
  return reference.fights === 0 ? '-' : `${fixed(reference.clearRate * 100, 0)}% clear, ${fixed(reference.deathRate * 100, 0)}% die, ${fixed(reference.seconds.median, 0)}s, took ${fixed(reference.taken.median, 0)}`;
}

function line(cells: readonly string[]): string {
  return `| ${cells.join(' | ')} |`;
}

export function buildTable(rows: readonly BuildRow[]): string {
  const progress: string[] = [
    line(['build', 'runs', ...BUILD_TABLE.levels.map((level: number): string => `L${level} time`), 'end level', 'kills/min', 'fight dps']),
    line(['---', '---', ...BUILD_TABLE.levels.map((): string => '---'), '---', '---', '---']),
    ...rows.map((row: BuildRow): string => line([row.build, String(row.runs), ...BUILD_TABLE.levels.map((level: number): string => levelCell(row.levels.find((entry: LevelTime): boolean => entry.level === level))), range(row.endLevel, (value: number): string => fixed(value, 1)), range(row.killsPerMinute, (value: number): string => fixed(value, 1)), range(row.fightDps, (value: number): string => fixed(value, 0))])),
  ];
  const danger: string[] = [
    line(['build', 'taken/min', 'deaths/h', 'xp lost/h', 'below 1/3 life', 'elite fights', 'pack fights']),
    line(['---', '---', '---', '---', '---', '---', '---']),
    ...rows.map((row: BuildRow): string => line([row.build, range(row.takenPerMinute, (value: number): string => fixed(value, 0)), range(row.deathsPerHour, (value: number): string => fixed(value, 1)), range(row.xpLostPerHour, (value: number): string => fixed(value, 0)), range(row.lowShare, (value: number): string => `${fixed(value * 100, 1)}%`), referenceCell(row.elite), referenceCell(row.pack)])),
  ];
  return [...progress, '', ...danger, ''].join('\n');
}
