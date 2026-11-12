import type { DeviceFacts } from './quality.ts';

export const PAGE = {
  scrollable: '.hud-panel, .pause-card, #title',
} as const;

export function readDeviceFacts(): DeviceFacts {
  const memory: unknown = Reflect.get(navigator, 'deviceMemory');
  const cores: number = navigator.hardwareConcurrency;
  return {
    search: window.location.search,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    shortSide: Math.min(window.innerWidth, window.innerHeight),
    longSide: Math.max(window.innerWidth, window.innerHeight),
    deviceMemory: typeof memory === 'number' && memory > 0 ? memory : null,
    cores: cores > 0 ? cores : null,
  };
}

function stop(event: Event): void {
  event.preventDefault();
}

function lockLandscape(): undefined {
  const orientation: unknown = Reflect.get(screen, 'orientation');
  if (orientation === null || typeof orientation !== 'object') return undefined;
  const lock: unknown = Reflect.get(orientation, 'lock');
  if (typeof lock !== 'function') return undefined;
  const locking: unknown = Reflect.apply(lock, orientation, ['landscape']);
  if (locking instanceof Promise) locking.catch(ignore);
  return undefined;
}

function ignore(): undefined {
  return undefined;
}

export function holdPageStill(): void {
  document.addEventListener('gesturestart', stop);
  document.addEventListener('dblclick', stop);
  document.addEventListener(
    'touchmove',
    (event: TouchEvent): void => {
      const target: EventTarget | null = event.target;
      if (target instanceof Element && target.closest(PAGE.scrollable) !== null) return;
      event.preventDefault();
    },
    { passive: false },
  );
}

export function enterLandscapeFullscreen(): void {
  const root: HTMLElement = document.documentElement;
  if (document.fullscreenElement !== null || typeof root.requestFullscreen !== 'function') return;
  root.requestFullscreen({ navigationUI: 'hide' }).then(lockLandscape, ignore);
}
