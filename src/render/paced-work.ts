import type { Work } from '../../sim/work.ts';
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

export function heldWhile(pacer: FramePacer, held: () => boolean): FramePacer {
  return {
    now(): number {
      return pacer.now();
    },
    next(): Promise<void> {
      return new Promise<void>((resolve: () => void): void => {
        const tick = (): void => {
          void pacer.next().then((): void => (held() ? tick() : resolve()));
        };
        tick();
      });
    },
  };
}

export function stepPaced(work: Work, pacer: FramePacer, budgetMs: number, live: () => boolean): Promise<void> {
  const run = async (): Promise<void> => {
    if (!live()) return;
    const started: number = pacer.now();
    let done: boolean = false;
    while (!done && pacer.now() - started < budgetMs) done = work.next().done === true;
    if (done) return;
    await pacer.next();
    await run();
  };
  return run();
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

export interface TurnGate {
  turn(): Promise<void>;
  hurry<T>(work: Promise<T>): Promise<T>;
}

export const OPEN_GATE: TurnGate = {
  turn: (): Promise<void> => Promise.resolve(),
  hurry: <T>(work: Promise<T>): Promise<T> => work,
};

export function turnGate(pacer: FramePacer, budgetMs: number = PACED_WORK.frameBudgetMs): TurnGate {
  let started: number = pacer.now();
  let last: Promise<void> = Promise.resolve();
  let hurrying: number = 0;
  const waiters: Set<() => void> = new Set<() => void>();
  const afterFrame = async (resolve: () => void): Promise<void> => {
    await pacer.next();
    waiters.delete(resolve);
    resolve();
  };
  const nextFrameOrHurry = (): Promise<void> =>
    new Promise<void>((resolve: () => void): void => {
      waiters.add(resolve);
      void afterFrame(resolve);
    });
  const hurried = async (work: Promise<unknown>): Promise<void> => {
    await Promise.allSettled([work]);
    hurrying -= 1;
  };
  const wait = async (): Promise<void> => {
    if (hurrying > 0 || pacer.now() - started < budgetMs) return;
    await nextFrameOrHurry();
    started = pacer.now();
  };
  return {
    turn(): Promise<void> {
      const mine: Promise<void> = last.then(wait, wait);
      last = mine;
      return mine;
    },
    hurry<T>(work: Promise<T>): Promise<T> {
      hurrying += 1;
      for (const release of waiters) release();
      waiters.clear();
      void hurried(work);
      return work;
    },
  };
}

export async function eachInTurn<T, R>(items: readonly T[], gate: TurnGate, work: (item: T) => R): Promise<R[]> {
  const done: R[] = [];
  const step = async (index: number): Promise<void> => {
    const item: T | undefined = items[index];
    if (index >= items.length || item === undefined) return;
    await gate.turn();
    done.push(work(item));
    await step(index + 1);
  };
  await step(0);
  return done;
}
