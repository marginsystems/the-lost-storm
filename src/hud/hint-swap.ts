import type { Timers } from '../backend/backend.ts';

export const HINT_SWAP = {
  outMs: 420,
} as const;

export interface HintFace<H> {
  fill(hint: H): void;
  show(shown: boolean): void;
  showing(): boolean;
}

export interface HintSwap<H> {
  show(hint: H): void;
  hide(): void;
  busy(): boolean;
}

export function createHintSwap<H>(face: HintFace<H>, timers: Timers): HintSwap<H> {
  let cancel: (() => void) | null = null;
  const stop = (): void => {
    if (cancel !== null) cancel();
    cancel = null;
  };
  return {
    show(hint: H): void {
      stop();
      if (!face.showing()) {
        face.fill(hint);
        face.show(true);
        return;
      }
      face.show(false);
      cancel = timers.after(HINT_SWAP.outMs, (): void => {
        cancel = null;
        face.fill(hint);
        face.show(true);
      });
    },
    hide(): void {
      stop();
      face.show(false);
    },
    busy(): boolean {
      return cancel !== null;
    },
  };
}
