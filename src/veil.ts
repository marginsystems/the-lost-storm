export const VEIL = {
  fallbackMs: 900,
  coverClass: 'on',
  markClass: 'veil-mark',
} as const;

import { coverExitAt } from './loader-cycle.ts';
import type { LoadingMark } from './loading-mark.ts';
import { createLoadingMark } from './loading-mark.ts';
import type { Veil } from './transition.ts';

function faded(element: HTMLElement): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    let settled: boolean = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      element.removeEventListener('transitionend', ended);
      window.clearTimeout(fallback);
      resolve();
    };
    const ended = (event: TransitionEvent): void => {
      if (event.target === element && event.propertyName === 'opacity') finish();
    };
    element.addEventListener('transitionend', ended);
    const fallback: number = window.setTimeout(finish, VEIL.fallbackMs);
  });
}

function wait(ms: number): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    window.setTimeout(resolve, Math.max(0, ms));
  });
}

export function createVeil(element: HTMLElement): Veil {
  const mark: LoadingMark = createLoadingMark(element, VEIL.markClass);
  let markStarted: number | null = null;
  let coveredAt: number = 0;
  return {
    async cover(colour: string | null): Promise<void> {
      element.style.background = colour ?? '';
      element.classList.add(VEIL.coverClass);
      await faded(element);
      coveredAt = performance.now();
      markStarted = await mark.start();
    },
    async hold(): Promise<void> {
      if (markStarted === null) return;
      const now: number = performance.now();
      const doneAt: number = now - markStarted;
      const exitAt: number | null = coverExitAt(now - coveredAt, doneAt);
      if (exitAt === null) {
        mark.stop();
        markStarted = null;
        return;
      }
      mark.endAfter(exitAt);
      await wait(exitAt - doneAt);
    },
    async lift(): Promise<void> {
      element.classList.remove(VEIL.coverClass);
      await faded(element);
      mark.stop();
      markStarted = null;
    },
  };
}
