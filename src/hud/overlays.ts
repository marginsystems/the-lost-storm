import type { Timers } from '../backend/backend.ts';
import { anyOverlay, chromeHidden, INITIAL_OVERLAYS, isShown, stepOverlays, topOverlay } from './overlay-core.ts';
import type { OverlayEvent, OverlayOutcome, OverlayPhase, OverlayState, OverlayStep } from './overlay-core.ts';
import { OVERLAY_IDS, overlayZ } from './overlay-table.ts';
import type { OverlayId } from './overlay-table.ts';

export interface OverlaySurface {
  readonly style: { zIndex: string };
}

export interface OverlayHandle {
  readonly element: OverlaySurface | null;
  show(): void;
  hide(): void;
}

export interface OverlayBody {
  readonly dataset: DOMStringMap;
}

export interface OverlayDriverOptions {
  readonly body: OverlayBody;
  readonly timers: Timers;
  readonly motionMs: () => number;
}

export type OverlayListener = (state: OverlayState, previous: OverlayState) => void;

export interface OverlayManager {
  register(id: OverlayId, handle: OverlayHandle): void;
  send(event: OverlayEvent): OverlayOutcome;
  shown(id: OverlayId): boolean;
  live(id: OverlayId): boolean;
  hasTop(): boolean;
  state(): OverlayState;
  subscribe(listener: OverlayListener): void;
}

export const OVERLAY_BODY = {
  full: 'overlayFull',
  any: 'overlay',
  on: 'on',
  off: 'off',
} as const;

export function durationMs(text: string): number | null {
  const match: RegExpExecArray | null = /^\s*(\d*\.?\d+)\s*(ms|s)\s*$/.exec(text);
  if (match === null) return null;
  const value: number = Number.parseFloat(match[1] ?? '');
  return match[2] === 's' ? value * 1000 : value;
}

export function createOverlayManager(options: OverlayDriverOptions): OverlayManager {
  const handles: Map<OverlayId, OverlayHandle> = new Map<OverlayId, OverlayHandle>();
  const cancels: Map<OverlayId, () => void> = new Map<OverlayId, () => void>();
  const listeners: OverlayListener[] = [];
  const queue: OverlayEvent[] = [];
  let state: OverlayState = INITIAL_OVERLAYS;
  let running: boolean = false;

  const mark = (): void => {
    options.body.dataset[OVERLAY_BODY.full] = chromeHidden(state) ? OVERLAY_BODY.on : OVERLAY_BODY.off;
    options.body.dataset[OVERLAY_BODY.any] = anyOverlay(state) ? OVERLAY_BODY.on : OVERLAY_BODY.off;
  };

  const schedule = (id: OverlayId, handle: OverlayHandle | undefined): void => {
    cancels.get(id)?.();
    const ms: number = handle === undefined || handle.element === null ? 0 : options.motionMs();
    cancels.set(
      id,
      options.timers.after(ms, (): void => {
        cancels.delete(id);
        dispatch({ type: 'settled', id });
      }),
    );
  };

  const follow = (previous: OverlayState): void => {
    for (const id of OVERLAY_IDS) {
      const was: OverlayPhase = previous.phase[id];
      const now: OverlayPhase = state.phase[id];
      if (was === now) continue;
      const handle: OverlayHandle | undefined = handles.get(id);
      if (now === 'opening') {
        if (handle !== undefined && handle.element !== null) handle.element.style.zIndex = String(overlayZ(id));
        handle?.show();
        schedule(id, handle);
      } else if (now === 'closing') {
        handle?.hide();
        schedule(id, handle);
      }
    }
    mark();
    for (const listener of listeners) listener(state, previous);
  };

  const dispatch = (event: OverlayEvent): OverlayOutcome => {
    if (running) {
      queue.push(event);
      return 'waiting';
    }
    running = true;
    const step: OverlayStep = stepOverlays(state, event);
    const previous: OverlayState = state;
    state = step.state;
    follow(previous);
    for (let next: OverlayEvent | undefined = queue.shift(); next !== undefined; next = queue.shift()) {
      const before: OverlayState = state;
      state = stepOverlays(state, next).state;
      follow(before);
    }
    running = false;
    return step.outcome;
  };

  mark();
  return {
    register(id: OverlayId, handle: OverlayHandle): void {
      handles.set(id, handle);
    },
    send: dispatch,
    shown(id: OverlayId): boolean {
      return isShown(state, id);
    },
    live(id: OverlayId): boolean {
      return state.phase[id] !== 'closed';
    },
    hasTop(): boolean {
      return topOverlay(state, 'death') !== null;
    },
    state(): OverlayState {
      return state;
    },
    subscribe(listener: OverlayListener): void {
      listeners.push(listener);
    },
  };
}
