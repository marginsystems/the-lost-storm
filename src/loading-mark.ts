import { LOADER_CYCLE, loaderCycles, loaderExitAt } from './loader-cycle.ts';
import type { LoaderTiming } from './loader-cycle.ts';

export const LOADING_MARK = {
  size: 5,
  playingClass: 'playing',
  waveSpread: 0.45,
  pixelLitFor: 0.45,
  cyclesProperty: '--mark-cycles',
} as const;

export interface LoadingMark {
  readonly element: HTMLElement;
  start(): Promise<number>;
  endAfter(exitAtMs: number): void;
  stop(): void;
}

export function markPhase(row: number, column: number): number {
  return ((row + column) / (2 * (LOADING_MARK.size - 1))) * LOADING_MARK.waveSpread;
}

function nextFrame(): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    requestAnimationFrame((): void => resolve());
  });
}

export async function untilCycleEnds(element: HTMLElement, timing: LoaderTiming = LOADER_CYCLE): Promise<void> {
  const doneAt: number = performance.now() - startedAt(element);
  const exitAt: number = loaderExitAt(doneAt, timing);
  if (exitAt <= doneAt) return;
  endMarkAfter(element, exitAt, timing);
  await new Promise<void>((resolve: () => void): void => {
    window.setTimeout(resolve, exitAt - doneAt);
  });
}

export function endMarkAfter(element: HTMLElement, exitAtMs: number, timing: LoaderTiming = LOADER_CYCLE): void {
  element.style.setProperty(LOADING_MARK.cyclesProperty, String(loaderCycles(exitAtMs, timing)));
}

function startedAt(element: HTMLElement): number {
  for (const animation of element.getAnimations({ subtree: true })) {
    const start: CSSNumberish | null = animation.startTime;
    if (typeof start === 'number') return start;
  }
  return performance.now();
}

export function createLoadingMark(parent: HTMLElement, className: string, timing: LoaderTiming = LOADER_CYCLE): LoadingMark {
  const element: HTMLDivElement = document.createElement('div');
  element.className = `loading-mark ${className}`;
  element.setAttribute('aria-hidden', 'true');
  element.style.setProperty('--mark-cycle', `${timing.cycleMs}ms`);
  element.style.setProperty('--mark-show', `${timing.showDelayMs}ms`);
  element.style.setProperty('--mark-step', String(markPhase(0, 1)));
  for (let pixel: number = 0; pixel < LOADING_MARK.size * LOADING_MARK.size; pixel += 1) element.append(document.createElement('i'));
  parent.append(element);
  return {
    element,
    async start(): Promise<number> {
      element.style.removeProperty(LOADING_MARK.cyclesProperty);
      element.classList.add(LOADING_MARK.playingClass);
      await nextFrame();
      await nextFrame();
      return startedAt(element);
    },
    endAfter(exitAtMs: number): void {
      endMarkAfter(element, exitAtMs, timing);
    },
    stop(): void {
      element.classList.remove(LOADING_MARK.playingClass);
    },
  };
}
