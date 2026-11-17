import type { Timers } from '../backend/backend.ts';

export const KEEP_LOADING = {
  firstDelayMs: 2000,
  growth: 2,
  longestDelayMs: 30_000,
  millisecondsPerSecond: 1000,
} as const;

export interface KeepLoadingDeps {
  readonly timers: Timers;
  readonly warn: (message: string) => void;
}

export interface KeptLoad {
  readonly first: Promise<boolean>;
  readonly done: Promise<void>;
}

export interface NamedLoad {
  readonly what: string;
  readonly load: () => Promise<void>;
}

export function retryDelay(failures: number): number {
  const grown: number = KEEP_LOADING.firstDelayMs * KEEP_LOADING.growth ** Math.max(0, failures - 1);
  return Math.min(KEEP_LOADING.longestDelayMs, grown);
}

interface Failed {
  readonly error: unknown;
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function failureOf(work: Promise<void>): Promise<Failed | null> {
  try {
    await work;
    return null;
  } catch (error: unknown) {
    return { error };
  }
}

function pause(timers: Timers, ms: number): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    timers.after(ms, resolve);
  });
}

async function untilLoaded(what: string, load: () => Promise<void>, deps: KeepLoadingDeps, attempt: Promise<Failed | null>, failures: number): Promise<void> {
  const failed: Failed | null = await attempt;
  if (failed === null) {
    if (failures > 0) deps.warn(`${what} arrived late, after ${failures + 1} tries`);
    return;
  }
  const wait: number = retryDelay(failures + 1);
  deps.warn(`${what} is late: try ${failures + 1} failed (${reason(failed.error)}); trying again in ${(wait / KEEP_LOADING.millisecondsPerSecond).toFixed(0)} s`);
  await pause(deps.timers, wait);
  await untilLoaded(what, load, deps, failureOf(load()), failures + 1);
}

export function keepLoading(what: string, load: () => Promise<void>, deps: KeepLoadingDeps): KeptLoad {
  const firstTry: Promise<Failed | null> = failureOf(load());
  const first: Promise<boolean> = firstTry.then((failed: Failed | null): boolean => failed === null);
  return { first, done: untilLoaded(what, load, deps, firstTry, 0) };
}

export async function loadAllKeepTrying(loads: readonly NamedLoad[], deps: KeepLoadingDeps): Promise<void> {
  await Promise.all(loads.map((named: NamedLoad): Promise<boolean> => keepLoading(named.what, named.load, deps).first));
}
