export const TRANSITION = {
  fallbackMs: 900,
  activeClass: 'on',
} as const;

export interface ZoneTransition {
  readonly blocking: boolean;
  begin(swap: () => Promise<void>): void;
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
    begin(swap: () => Promise<void>): void {
      if (blocking) return;
      blocking = true;
      run(swap).catch(onError);
    },
  };
}
