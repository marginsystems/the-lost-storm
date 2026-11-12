export const TRANSITION = {
  fallbackMs: 900,
  activeClass: 'on',
} as const;

import type { ZoneDef } from '../sim/content/types.ts';
import type { WorldEvent } from '../sim/world/types.ts';

export interface ZoneTransition {
  readonly blocking: boolean;
  begin(swap: () => Promise<void>, colour: string | null): void;
}

export function leavingColour(zones: ReadonlyMap<string, ZoneDef>, events: readonly WorldEvent[]): string | null {
  for (const event of events) {
    if (event.type !== 'zone_changed') continue;
    return zones.get(event.from)?.ambience.background ?? null;
  }
  return null;
}

function faded(element: HTMLElement): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    let settled: boolean = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      element.removeEventListener('transitionend', finish);
      resolve();
    };
    element.addEventListener('transitionend', finish);
    window.setTimeout(finish, TRANSITION.fallbackMs);
  });
}

export function createZoneTransition(element: HTMLElement, onError: (error: unknown) => void): ZoneTransition {
  let blocking: boolean = false;

  const run = async (swap: () => Promise<void>): Promise<void> => {
    element.classList.add(TRANSITION.activeClass);
    await faded(element);
    await swap();
    blocking = false;
    element.classList.remove(TRANSITION.activeClass);
  };

  return {
    get blocking(): boolean {
      return blocking;
    },
    begin(swap: () => Promise<void>, colour: string | null): void {
      if (blocking) return;
      blocking = true;
      element.style.background = colour ?? '';
      run(swap).catch(onError);
    },
  };
}
