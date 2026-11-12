import { LOADER_CYCLE } from './loader-cycle.ts';
import type { LoaderTiming } from './loader-cycle.ts';

export const LOADING_MARK = {
  size: 5,
  playingClass: 'playing',
  waveSpread: 0.45,
  pixelLitFor: 0.45,
} as const;

export interface LoadingMark {
  readonly element: HTMLElement;
  start(): Promise<number>;
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
  for (let row: number = 0; row < LOADING_MARK.size; row += 1) {
    for (let column: number = 0; column < LOADING_MARK.size; column += 1) {
      const pixel: HTMLElement = document.createElement('i');
      pixel.style.setProperty('--mark-phase', String(markPhase(row, column)));
      element.append(pixel);
    }
  }
  parent.append(element);
  return {
    element,
    async start(): Promise<number> {
      element.classList.add(LOADING_MARK.playingClass);
      await nextFrame();
      await nextFrame();
      return startedAt(element);
    },
    stop(): void {
      element.classList.remove(LOADING_MARK.playingClass);
    },
  };
}
