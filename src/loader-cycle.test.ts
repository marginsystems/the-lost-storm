import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LoaderPhase, LoaderTiming } from './loader-cycle.ts';
import { LOADER_CYCLE, loaderCycles, loaderExitAt, loaderPhase } from './loader-cycle.ts';

const TIMING: LoaderTiming = { showDelayMs: 100, cycleMs: 500 };

function phases(doneAtMs: number | null, until: number, stepMs: number): LoaderPhase[] {
  const seen: LoaderPhase[] = [];
  for (let at: number = 0; at <= until; at += stepMs) {
    const phase: LoaderPhase = loaderPhase(at, doneAtMs !== null && at >= doneAtMs ? doneAtMs : null, TIMING);
    if (seen.at(-1) !== phase) seen.push(phase);
  }
  return seen;
}

void test('a load that ends before the show delay never shows the mark', (): void => {
  assert.deepEqual(phases(60, 2000, 10), ['waiting', 'skipped']);
  assert.equal(loaderExitAt(60, TIMING), 60);
});

void test('once shown the mark plays at least one full cycle, however soon the load ends', (): void => {
  assert.equal(loaderExitAt(120, TIMING), 600);
  assert.equal(loaderPhase(599, 120, TIMING), 'cycling');
  assert.equal(loaderPhase(600, 120, TIMING), 'leaving');
});

void test('the mark leaves only on a cycle boundary, the first one after the load ends', (): void => {
  assert.equal(loaderExitAt(600, TIMING), 600);
  assert.equal(loaderExitAt(601, TIMING), 1100);
  assert.equal(loaderExitAt(1430, TIMING), 1600);
  assert.deepEqual(phases(1430, 3000, 10), ['waiting', 'cycling', 'leaving']);
  for (const done of [150, 333, 777, 2049]) assert.equal((loaderExitAt(done, TIMING) - TIMING.showDelayMs) % TIMING.cycleMs, 0);
});

void test('the mark stops after the cycle it leaves on, so its pixels rest dark through the exit', (): void => {
  assert.equal(loaderCycles(loaderExitAt(400)), 1);
  assert.equal(loaderCycles(loaderExitAt(900)), 2);
  assert.equal(loaderCycles(loaderExitAt(LOADER_CYCLE.showDelayMs + 3 * LOADER_CYCLE.cycleMs)), 3);
  assert.equal(loaderCycles(loaderExitAt(100)), 0);
});

void test('while the load runs the mark keeps cycling, never leaving', (): void => {
  for (let at: number = TIMING.showDelayMs; at < 10000; at += 37) assert.equal(loaderPhase(at, null, TIMING), 'cycling');
});

void test('the shared cycle stays under a second so a crossing grows by less than one cycle', (): void => {
  const cycle: number = LOADER_CYCLE.cycleMs;
  assert.ok(cycle < 1000);
  for (let done: number = LOADER_CYCLE.showDelayMs; done < 4000; done += 13) assert.ok(loaderExitAt(done) - done <= LOADER_CYCLE.cycleMs);
});
