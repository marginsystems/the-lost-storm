import type { Backend, BackendState, Timers } from './backend/backend.ts';

const TITLE_SYNC: { readonly swapMs: number } = { swapMs: 280 };

const LABELS: Readonly<Record<BackendState, string>> = {
  offline: 'Offline',
  cloud: 'Cloud save on',
};

export interface TitleLine {
  textContent: string | null;
  readonly dataset: Record<string, string | undefined>;
  readonly classList: { add(name: string): void; remove(name: string): void };
}

export function createTitleSync(line: TitleLine, timers: Timers): (state: BackendState) => void {
  let requested: BackendState | null = null;
  let cancelSwap: (() => void) | null = null;
  return (state: BackendState): void => {
    if (state === requested) return;
    const first: boolean = requested === null;
    requested = state;
    cancelSwap?.();
    cancelSwap = null;
    const apply = (): void => {
      cancelSwap = null;
      line.textContent = LABELS[state];
      line.dataset['state'] = state;
      line.classList.add('shown');
    };
    if (first) {
      apply();
      return;
    }
    line.classList.remove('shown');
    cancelSwap = timers.after(TITLE_SYNC.swapMs, apply);
  };
}

export function followSync(backend: Pick<Backend, 'state' | 'subscribe'>, show: (state: BackendState) => void, served: boolean): void {
  if (!served) return;
  show(backend.state());
  backend.subscribe(show);
}
