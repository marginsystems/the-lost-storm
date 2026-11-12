export const LOADER_CYCLE = {
  showDelayMs: 150,
  cycleMs: 720,
} as const;

export interface LoaderTiming {
  readonly showDelayMs: number;
  readonly cycleMs: number;
}

export type LoaderPhase = 'waiting' | 'skipped' | 'cycling' | 'leaving';

export function loaderExitAt(doneAtMs: number, timing: LoaderTiming = LOADER_CYCLE): number {
  if (doneAtMs < timing.showDelayMs) return doneAtMs;
  const cycles: number = Math.max(1, Math.ceil((doneAtMs - timing.showDelayMs) / timing.cycleMs));
  return timing.showDelayMs + cycles * timing.cycleMs;
}

export function loaderPhase(elapsedMs: number, doneAtMs: number | null, timing: LoaderTiming = LOADER_CYCLE): LoaderPhase {
  if (doneAtMs !== null && doneAtMs < timing.showDelayMs && elapsedMs >= doneAtMs) return 'skipped';
  if (elapsedMs < timing.showDelayMs) return 'waiting';
  if (doneAtMs === null) return 'cycling';
  return elapsedMs < loaderExitAt(doneAtMs, timing) ? 'cycling' : 'leaving';
}
