import { BOUNDED_WAIT, nextFrameWithin } from '../bounded-wait.ts';
import { createBrowserFrames, createBrowserTimers } from '../browser-timers.ts';

export const PACED_WORK = {
  frameBudgetMs: 6,
} as const;

export interface FramePacer {
  now(): number;
  next(): Promise<void>;
}

export interface CostLimit<T> {
  readonly perFrame: number;
  cost(item: T): number;
}

export function browserPacer(): FramePacer {
  return {
    now(): number {
      return performance.now();
    },
    next(): Promise<void> {
      return nextFrameWithin(createBrowserFrames(), createBrowserTimers(), BOUNDED_WAIT.frameMs);
    },
  };
}

export function workPaced<T>(items: readonly T[], work: (item: T) => void, pacer: FramePacer, budgetMs: number = PACED_WORK.frameBudgetMs, limit: CostLimit<T> | null = null): Promise<void> {
  const run = async (from: number): Promise<void> => {
    const started: number = pacer.now();
    let index: number = from;
    let spent: number = 0;
    while (index < items.length) {
      const item: T | undefined = items[index];
      const cost: number = item === undefined || limit === null ? 0 : limit.cost(item);
      if (index !== from && (pacer.now() - started >= budgetMs || (limit !== null && spent + cost > limit.perFrame))) break;
      if (item !== undefined) work(item);
      spent += cost;
      index += 1;
    }
    if (index >= items.length) return;
    await pacer.next();
    await run(index);
  };
  return run(0);
}

export function framesOf<T>(items: readonly T[], limit: CostLimit<T>): T[][] {
  const frames: T[][] = [];
  let current: T[] = [];
  let spent: number = 0;
  for (const item of items) {
    const cost: number = limit.cost(item);
    if (current.length > 0 && spent + cost > limit.perFrame) {
      frames.push(current);
      current = [];
      spent = 0;
    }
    current.push(item);
    spent += cost;
  }
  if (current.length > 0) frames.push(current);
  return frames;
}
