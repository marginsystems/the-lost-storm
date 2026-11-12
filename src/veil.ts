export const VEIL = {
  fallbackMs: 900,
  coverClass: 'on',
  lightClass: 'light',
  namedClass: 'named',
} as const;

import type { Veil } from './transition.ts';
import { isLight } from './transition.ts';

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

export function createVeil(element: HTMLElement, place: HTMLElement): Veil {
  return {
    async cover(colour: string | null, name: string): Promise<void> {
      element.style.background = colour ?? '';
      element.classList.toggle(VEIL.lightClass, isLight(colour));
      place.textContent = name;
      element.classList.add(VEIL.coverClass);
      await faded(element);
      place.classList.add(VEIL.namedClass);
    },
    async lift(): Promise<void> {
      place.classList.remove(VEIL.namedClass);
      element.classList.remove(VEIL.coverClass);
      await faded(element);
    },
  };
}
