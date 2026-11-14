import { spread } from './simulate-summary.ts';
import type { Policies } from './simulate-policies.ts';
import type { Job } from './simulate-run.ts';
import { runJob } from './simulate-run.ts';
import type { RunSummary } from './simulate-summary.ts';
import { summarize } from './simulate-summary.ts';

export const BAND = {
  archetypes: ['glass', 'tank', 'caster', 'windrunner', 'echoer'],
  seeds: [1, 2],
  level: 8,
  minutes: 30,
  skill: 'average',
  share: 0.2,
} as const;

export function timeToLevel(policies: Policies, build: string, seed: number): number | null {
  const job: Job = { scenario: { kind: 'level', level: BAND.level, minutes: BAND.minutes }, skill: BAND.skill, build, seed, danger: 1, toughness: 1 };
  const run: RunSummary = summarize(runJob(job, policies));
  return run.levels[String(BAND.level)] ?? null;
}

export function outsideBand(times: ReadonlyMap<string, number>, share: number): string[] {
  const middle: number = spread([...times.values()]).median;
  return [...times].filter(([, time]: [string, number]): boolean => Math.abs(time - middle) > middle * share).map(([build]: [string, number]): string => build);
}
