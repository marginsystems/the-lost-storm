export const VEIL = {
  fallbackMs: 900,
  coverClass: 'on',
} as const;

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

export function createVeil(element: HTMLElement): Veil {
  return {
    async cover(colour: string | null): Promise<void> {
      element.style.background = colour ?? '';
      element.classList.add(VEIL.coverClass);
      await faded(element);
    },
    async lift(): Promise<void> {
      element.classList.remove(VEIL.coverClass);
      await faded(element);
    },
  };
}
