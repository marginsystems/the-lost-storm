export const FRAME_METER = {
  windowMs: 1000,
  longWindowMs: 10000,
  longOver: 1.5,
  budgetQuantile: 0.1,
  refreshRates: [240, 165, 144, 120, 90, 75, 60, 50, 30],
  maxGapMs: 1000,
  updateMs: 250,
} as const;

export interface FrameReading {
  readonly fps: number;
  readonly worstMs: number;
  readonly longFrames: number;
  readonly budgetMs: number;
}

export type FrameView = 'shown' | 'veiled';

export interface FrameMeter {
  frame(now: number, view: FrameView): void;
  reading(now: number): FrameReading | null;
}

interface Sample {
  readonly at: number;
  readonly ms: number;
}

export function displayBudget(intervals: readonly number[]): number {
  const fallback: number = 1000 / 60;
  if (intervals.length === 0) return fallback;
  const sorted: number[] = intervals.toSorted((a: number, b: number): number => a - b);
  const fast: number = sorted[Math.floor((sorted.length - 1) * FRAME_METER.budgetQuantile)] ?? fallback;
  let best: number = fallback;
  for (const rate of FRAME_METER.refreshRates) if (Math.abs(1000 / rate - fast) < Math.abs(best - fast)) best = 1000 / rate;
  return best;
}

export function createFrameMeter(): FrameMeter {
  const samples: Sample[] = [];
  let last: number | null = null;
  return {
    frame(now: number, view: FrameView): void {
      if (view === 'veiled') {
        samples.length = 0;
        last = null;
        return;
      }
      const previous: number | null = last;
      last = now;
      while (samples.length > 0 && (samples[0]?.at ?? now) <= now - FRAME_METER.longWindowMs) samples.shift();
      if (previous === null) return;
      const ms: number = now - previous;
      if (ms <= 0 || ms > FRAME_METER.maxGapMs) return;
      samples.push({ at: now, ms });
    },
    reading(now: number): FrameReading | null {
      const kept: Sample[] = samples.filter((sample: Sample): boolean => sample.at > now - FRAME_METER.longWindowMs);
      const recent: Sample[] = kept.filter((sample: Sample): boolean => sample.at > now - FRAME_METER.windowMs);
      if (recent.length === 0) return null;
      const spent: number = recent.reduce((sum: number, sample: Sample): number => sum + sample.ms, 0);
      const budgetMs: number = displayBudget(kept.map((sample: Sample): number => sample.ms));
      return {
        fps: (recent.length * 1000) / spent,
        worstMs: Math.max(...kept.map((sample: Sample): number => sample.ms)),
        longFrames: kept.filter((sample: Sample): boolean => sample.ms > budgetMs * FRAME_METER.longOver).length,
        budgetMs,
      };
    },
  };
}

export function describeFrames(reading: FrameReading): string {
  return `${Math.round(reading.fps)} fps · ${Math.round(reading.worstMs)} ms worst · ${reading.longFrames} long`;
}
