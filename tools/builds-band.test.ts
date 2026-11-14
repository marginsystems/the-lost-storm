import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BAND, outsideBand, timeToLevel } from './builds-band.ts';
import { POLICIES } from './simulate-policies.ts';
import { spread } from './simulate-summary.ts';

void test('a build whose time is more than the share away from the median of all builds is outside the band', (): void => {
  const times: Map<string, number> = new Map<string, number>([['a', 100], ['b', 110], ['c', 95], ['d', 105], ['e', 160]]);
  assert.deepEqual(outsideBand(times, 0.2), ['e']);
  assert.deepEqual(outsideBand(times, 0.7), []);
  assert.deepEqual(outsideBand(new Map<string, number>([['a', 100], ['b', 60], ['c', 100]]), 0.2), ['b']);
});

void test('every archetype reaches the same level in a time within a fifth of the median archetype', (): void => {
  const medians: Map<string, number> = new Map<string, number>();
  for (const build of BAND.archetypes) {
    assert.ok(POLICIES.builds.has(build), build);
    const times: number[] = BAND.seeds.flatMap((seed: number): number[] => {
      const t: number | null = timeToLevel(POLICIES, build, seed);
      return t === null ? [] : [t];
    });
    assert.equal(times.length, BAND.seeds.length, `${build} did not reach level ${BAND.level} in ${BAND.minutes} minutes on every seed`);
    medians.set(build, spread(times).median);
  }
  const misses: string[] = outsideBand(medians, BAND.share);
  assert.deepEqual(misses, [], `${misses.join(', ')} left the band around ${[...medians].map(([build, time]: [string, number]): string => `${build} ${Math.round(time)} s`).join(', ')}`);
});
