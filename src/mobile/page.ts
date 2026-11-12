import type { DeviceFacts } from './quality.ts';

export const PAGE = {
  reloadOfferMs: 6000,
  scrollable: '.hud-panel, .pause-card, #title',
} as const;

export function readDeviceFacts(): DeviceFacts {
  const memory: unknown = Reflect.get(navigator, 'deviceMemory');
  const cores: number = navigator.hardwareConcurrency;
  return {
    search: window.location.search,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
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

export interface ContextWatch {
  readonly lost: boolean;
}

export function watchContext(canvas: HTMLCanvasElement, parent: HTMLElement, onRestored: () => void): ContextWatch {
  let lost: boolean = false;
  let offer: number | undefined;
  const note: HTMLDivElement = document.createElement('div');
  note.className = 'tc-lost';
  note.setAttribute('role', 'status');
  const text: HTMLSpanElement = document.createElement('span');
  text.textContent = 'Restoring graphics…';
  const reload: HTMLButtonElement = document.createElement('button');
  reload.type = 'button';
  reload.textContent = 'Reload';
  reload.addEventListener('click', (): void => window.location.reload());
  note.append(text, reload);
  parent.append(note);
  canvas.addEventListener('webglcontextlost', (event: Event): void => {
    event.preventDefault();
    lost = true;
    note.classList.add('on');
    window.clearTimeout(offer);
    offer = window.setTimeout((): void => note.classList.add('stuck'), PAGE.reloadOfferMs);
  });
  canvas.addEventListener('webglcontextrestored', (): void => {
    lost = false;
    window.clearTimeout(offer);
    note.classList.remove('on', 'stuck');
    onRestored();
  });
  return {
    get lost(): boolean {
      return lost;
    },
  };
}
