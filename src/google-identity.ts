export type AskEnd = 'closed' | 'blocked' | 'failed';

export interface IdentityOptions {
  readonly clientId: string;
  readonly onToken: (accessToken: string) => void;
  readonly onEnd: (end: AskEnd) => void;
}

export interface GoogleAsk {
  ask(): void;
}

export interface GoogleIdentity {
  start(options: IdentityOptions): GoogleAsk;
}

interface TokenApi {
  readonly initTokenClient: (options: unknown) => unknown;
}

interface TokenClient {
  readonly requestAccessToken: () => void;
}

export interface MarkImage {
  src: string;
  readonly classList: { add(token: string): void };
  addEventListener(type: 'load' | 'error', listener: () => void, options: { readonly once: boolean }): void;
}

export const GOOGLE_IDENTITY: { readonly script: string; readonly mark: string; readonly markLoaded: string; readonly attempts: number; readonly retryMs: number; readonly scope: string; readonly prompt: string } = {
  script: 'https://accounts.google.com/gsi/client?hl=en',
  mark: 'https://www.gstatic.com/images/branding/googleg/svg/googleg_standard_clr_18px.svg',
  markLoaded: 'loaded',
  attempts: 4,
  retryMs: 1500,
  scope: 'openid profile',
  prompt: 'select_account',
};

const POPUP_ENDS: Readonly<Record<string, AskEnd>> = { popup_closed: 'closed', popup_failed_to_open: 'blocked' };
const DECLINED: string = 'access_denied';

function fieldOf(source: unknown, key: string): unknown {
  if ((typeof source !== 'object' && typeof source !== 'function') || source === null) return undefined;
  const value: unknown = Reflect.get(source, key);
  return value;
}

function isTokenApi(value: unknown): value is TokenApi {
  return typeof fieldOf(value, 'initTokenClient') === 'function';
}

function isTokenClient(value: unknown): value is TokenClient {
  return typeof fieldOf(value, 'requestAccessToken') === 'function';
}

export function readAccessToken(response: unknown): string | null {
  const token: unknown = fieldOf(response, 'access_token');
  return typeof token === 'string' && token !== '' ? token : null;
}

export function readEnd(error: unknown): AskEnd {
  const type: unknown = fieldOf(error, 'type');
  const code: unknown = fieldOf(error, 'error');
  if (code === DECLINED) return 'closed';
  return (typeof type === 'string' ? POPUP_ENDS[type] : undefined) ?? 'failed';
}

export function readIdentityApi(globals: unknown): GoogleIdentity | null {
  const api: unknown = fieldOf(fieldOf(fieldOf(globals, 'google'), 'accounts'), 'oauth2');
  if (!isTokenApi(api)) return null;
  return {
    start(options: IdentityOptions): GoogleAsk {
      const client: unknown = api.initTokenClient({
        client_id: options.clientId,
        scope: GOOGLE_IDENTITY.scope,
        prompt: GOOGLE_IDENTITY.prompt,
        callback: (response: unknown): void => {
          const token: string | null = readAccessToken(response);
          if (token === null) options.onEnd(readEnd(response));
          else options.onToken(token);
        },
        error_callback: (error: unknown): void => {
          options.onEnd(readEnd(error));
        },
      });
      return {
        ask(): void {
          if (isTokenClient(client)) client.requestAccessToken();
          else options.onEnd('failed');
        },
      };
    },
  };
}

export function showGoogleMark(image: MarkImage): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    image.addEventListener(
      'load',
      (): void => {
        image.classList.add(GOOGLE_IDENTITY.markLoaded);
        resolve();
      },
      { once: true },
    );
    image.addEventListener('error', resolve, { once: true });
    image.src = GOOGLE_IDENTITY.mark;
  });
}

function fetchScript(): Promise<GoogleIdentity | null> {
  return new Promise<GoogleIdentity | null>((resolve: (identity: GoogleIdentity | null) => void): void => {
    const script: HTMLScriptElement = document.createElement('script');
    script.src = GOOGLE_IDENTITY.script;
    script.async = true;
    script.addEventListener('load', (): void => {
      resolve(readIdentityApi(window));
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

async function loadWithin(attemptsLeft: number): Promise<GoogleIdentity | null> {
  const ready: GoogleIdentity | null = readIdentityApi(window);
  if (ready !== null) return ready;
  if (attemptsLeft <= 0) return null;
  const loaded: GoogleIdentity | null = await fetchScript();
  if (loaded !== null) return loaded;
  await pause(GOOGLE_IDENTITY.retryMs);
  return loadWithin(attemptsLeft - 1);
}

export function loadGoogleIdentity(): Promise<GoogleIdentity | null> {
  return loadWithin(GOOGLE_IDENTITY.attempts);
}
