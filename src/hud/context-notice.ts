import type { ContextPhase, ContextSignal } from './context-phase.ts';
import { contextNoticeShown, contextPolls, contextReloadOffered, contextWaits, nextContextPhase } from './context-phase.ts';
import { el, label } from './dom.ts';

export const CONTEXT_NOTICE = {
  reloadOfferMs: 6000,
  restoring: 'Restoring graphics…',
  failed: 'Graphics stopped.',
  faulted: 'Something went wrong.',
} as const;

export interface ContextWatch {
  readonly lost: boolean;
  fault(): void;
}

function noticeText(phase: ContextPhase): string {
  if (phase === 'faulted') return CONTEXT_NOTICE.faulted;
  return phase === 'failed' ? CONTEXT_NOTICE.failed : CONTEXT_NOTICE.restoring;
}

export function watchContext(canvas: HTMLCanvasElement, parent: HTMLElement, isLost: () => boolean, onRestored: () => void): ContextWatch {
  let phase: ContextPhase = 'live';
  let offer: number | undefined;
  let polling: boolean = false;
  const note: HTMLDivElement = el('div', 'ctx-notice', parent);
  note.setAttribute('role', 'status');
  const text: HTMLDivElement = label('ctx-text', CONTEXT_NOTICE.restoring, note);
  const reload: HTMLButtonElement = el('button', 'ctx-reload', note);
  reload.type = 'button';
  reload.textContent = 'Reload';
  reload.tabIndex = -1;
  reload.addEventListener('click', (): void => window.location.reload());

  const show = (): void => {
    note.classList.toggle('on', contextNoticeShown(phase));
    note.classList.toggle('failed', contextReloadOffered(phase));
    reload.tabIndex = contextReloadOffered(phase) ? 0 : -1;
    text.textContent = noticeText(phase);
  };

  const poll = (): void => {
    signal({ type: 'frame', contextLost: isLost() });
    if (!contextPolls(phase)) polling = false;
    else window.requestAnimationFrame(poll);
  };

  const signal = (next: ContextSignal): void => {
    const was: ContextPhase = phase;
    phase = nextContextPhase(phase, next);
    if (phase === was) return;
    window.clearTimeout(offer);
    if (contextWaits(phase)) offer = window.setTimeout((): void => signal({ type: 'timeout' }), CONTEXT_NOTICE.reloadOfferMs);
    if (contextPolls(phase) && !polling) {
      polling = true;
      window.requestAnimationFrame(poll);
    }
    show();
  };

  canvas.addEventListener('webglcontextlost', (event: Event): void => {
    event.preventDefault();
    signal({ type: 'lost' });
  });
  canvas.addEventListener('webglcontextrestored', (): void => {
    signal({ type: 'restored' });
    onRestored();
  });
  return {
    get lost(): boolean {
      return phase === 'lost' || phase === 'failed';
    },
    fault(): void {
      signal({ type: 'fault' });
    },
  };
}
