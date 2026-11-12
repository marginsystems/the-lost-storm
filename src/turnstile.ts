import type { Timers } from './backend/backend.ts';

export interface TurnstileApi {
  readonly render: (mount: unknown, options: unknown) => unknown;
  readonly reset: (widgetId: string) => void;
  readonly remove: (widgetId: string) => void;
}

export interface TurnstileGate {
  token(): Promise<string | null>;
  spend(): void;
}

export interface GateOptions {
  readonly api: TurnstileApi;
  readonly mount: unknown;
  readonly siteKey: string;
  readonly timers: Timers;
  readonly onInteractive: (interactive: boolean) => void;
}

export const TURNSTILE: { readonly script: string; readonly action: string; readonly attempts: number; readonly retryMs: number; readonly tokenWaitMs: number } = {
  script: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
  action: 'email-sign-in',
  attempts: 3,
  retryMs: 1500,
  tokenWaitMs: 60_000,
};

function fieldOf(source: unknown, key: string): unknown {
  if ((typeof source !== 'object' && typeof source !== 'function') || source === null) return undefined;
  const value: unknown = Reflect.get(source, key);
  return value;
}

function isTurnstileApi(value: unknown): value is TurnstileApi {
  return typeof fieldOf(value, 'render') === 'function' && typeof fieldOf(value, 'reset') === 'function' && typeof fieldOf(value, 'remove') === 'function';
}

export function readTurnstileApi(globals: unknown): TurnstileApi | null {
  const api: unknown = fieldOf(globals, 'turnstile');
  return isTurnstileApi(api) ? api : null;
}

export function createTurnstileGate(options: GateOptions): TurnstileGate {
  const { api, mount, siteKey, timers, onInteractive } = options;
  let current: string | null = null;
  let failed: boolean = false;
  let waiting: ((token: string | null) => void)[] = [];

  const settle = (token: string | null): void => {
    const ready: ((token: string | null) => void)[] = waiting;
    waiting = [];
    for (const resolve of ready) resolve(token);
  };

  const rendered: unknown = api.render(mount, {
    sitekey: siteKey,
    action: TURNSTILE.action,
    theme: 'dark',
    size: 'normal',
    appearance: 'interaction-only',
    callback: (token: unknown): void => {
      if (typeof token !== 'string' || token === '') return;
      current = token;
      failed = false;
      onInteractive(false);
      settle(token);
    },
    'expired-callback': (): void => {
      current = null;
    },
    'error-callback': (): void => {
      current = null;
      failed = true;
      onInteractive(false);
      settle(null);
    },
    'before-interactive-callback': (): void => {
      onInteractive(true);
    },
    'after-interactive-callback': (): void => {
      onInteractive(false);
    },
  });
  const widgetId: string | null = typeof rendered === 'string' ? rendered : null;

  return {
    token(): Promise<string | null> {
      if (current !== null) return Promise.resolve(current);
      if (failed || widgetId === null) {
        failed = false;
        if (widgetId !== null) api.reset(widgetId);
        if (widgetId === null) return Promise.resolve(null);
      }
      return new Promise<string | null>((resolve: (token: string | null) => void): void => {
        let done: boolean = false;
        const finish = (token: string | null): void => {
          if (done) return;
          done = true;
          cancel();
          resolve(token);
        };
        const cancel: () => void = timers.after(TURNSTILE.tokenWaitMs, (): void => {
          waiting = waiting.filter((entry: (token: string | null) => void): boolean => entry !== finish);
          finish(null);
        });
        waiting.push(finish);
      });
    },
    spend(): void {
      current = null;
      if (widgetId !== null) api.reset(widgetId);
    },
  };
}

function fetchScript(): Promise<TurnstileApi | null> {
  return new Promise<TurnstileApi | null>((resolve: (api: TurnstileApi | null) => void): void => {
    const script: HTMLScriptElement = document.createElement('script');
    script.src = TURNSTILE.script;
    script.async = true;
    script.addEventListener('load', (): void => {
      resolve(readTurnstileApi(window));
    });
    script.addEventListener('error', (): void => {
      script.remove();
      resolve(null);
    });
    document.head.append(script);
  });
}

function pause(ms: number): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    window.setTimeout(resolve, ms);
  });
}

async function loadWithin(attemptsLeft: number): Promise<TurnstileApi | null> {
  const ready: TurnstileApi | null = readTurnstileApi(window);
  if (ready !== null) return ready;
  if (attemptsLeft <= 0) return null;
  const loaded: TurnstileApi | null = await fetchScript();
  if (loaded !== null) return loaded;
  await pause(TURNSTILE.retryMs);
  return loadWithin(attemptsLeft - 1);
}

let loading: Promise<TurnstileApi | null> | null = null;

export function loadTurnstile(): Promise<TurnstileApi | null> {
  loading ??= loadWithin(TURNSTILE.attempts).then((api: TurnstileApi | null): TurnstileApi | null => {
    if (api === null) loading = null;
    return api;
  });
  return loading;
}
