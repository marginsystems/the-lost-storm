export const BROWSER_NOTICES = {
  webgl: 'This browser cannot draw the game: it needs WebGL 2. Try an up-to-date Chrome, Edge, Firefox or Safari, or turn on hardware acceleration.',
  old: 'This browser is too old to run the game. Update it, or try an up-to-date Chrome, Edge, Firefox or Safari.',
  stopped: 'The storm could not finish loading. Reloading usually helps.',
  reload: 'Reload',
} as const;

export const RETRY = {
  key: 'the-lost-storm.reload-at',
  gapMs: 60_000,
  started: 'started',
} as const;

export interface RetryStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface BrowserProbe {
  readonly webgl2: boolean;
  readonly modernArrays: boolean;
}

export class UnsupportedBrowser extends Error {}

export function unsupportedReason(probe: BrowserProbe): string | null {
  if (!probe.modernArrays) return BROWSER_NOTICES.old;
  if (!probe.webgl2) return BROWSER_NOTICES.webgl;
  return null;
}

export function probeBrowser(scope: object, arrays: object): BrowserProbe {
  return { webgl2: 'WebGL2RenderingContext' in scope, modernArrays: ['toSorted', 'toReversed', 'findLast', 'at'].every((name: string): boolean => name in arrays) };
}

export function failureText(error: unknown): string {
  return error instanceof UnsupportedBrowser ? error.message : BROWSER_NOTICES.stopped;
}

export function reloadHelps(error: unknown): boolean {
  return !(error instanceof UnsupportedBrowser);
}

export function createdOrUnsupported<T>(create: () => T): T {
  try {
    return create();
  } catch {
    throw new UnsupportedBrowser(BROWSER_NOTICES.webgl);
  }
}

export function sessionStore(scope: { readonly sessionStorage: RetryStore }): RetryStore | null {
  try {
    return scope.sessionStorage;
  } catch {
    return null;
  }
}

export function claimRetry(store: RetryStore | null, now: number): boolean {
  if (store === null) return false;
  try {
    const last: number = Number(store.getItem(RETRY.key));
    if (last > 0 && now - last < RETRY.gapMs) return false;
    store.setItem(RETRY.key, String(now));
    return true;
  } catch {
    return false;
  }
}
