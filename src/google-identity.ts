export interface IdentityOptions {
  readonly clientId: string;
  readonly nonce: string;
  readonly onCredential: (credential: string) => void;
}

export interface GoogleIdentity {
  start(options: IdentityOptions, mount: HTMLElement): void;
}

interface IdentityApi {
  readonly initialize: (options: unknown) => void;
  readonly renderButton: (mount: HTMLElement, options: unknown) => void;
}

export const GOOGLE_IDENTITY: { readonly script: string; readonly attempts: number; readonly retryMs: number; readonly buttonWidth: number; readonly locale: string } = {
  script: 'https://accounts.google.com/gsi/client?hl=en',
  attempts: 4,
  retryMs: 1500,
  buttonWidth: 220,
  locale: 'en',
};

function fieldOf(source: unknown, key: string): unknown {
  if ((typeof source !== 'object' && typeof source !== 'function') || source === null) return undefined;
  const value: unknown = Reflect.get(source, key);
  return value;
}

function isIdentityApi(value: unknown): value is IdentityApi {
  return typeof fieldOf(value, 'initialize') === 'function' && typeof fieldOf(value, 'renderButton') === 'function';
}

export function readCredential(response: unknown): string | null {
  const credential: unknown = fieldOf(response, 'credential');
  return typeof credential === 'string' && credential !== '' ? credential : null;
}

export function readIdentityApi(globals: unknown): GoogleIdentity | null {
  const api: unknown = fieldOf(fieldOf(fieldOf(globals, 'google'), 'accounts'), 'id');
  if (!isIdentityApi(api)) return null;
  return {
    start(options: IdentityOptions, mount: HTMLElement): void {
      api.initialize({
        client_id: options.clientId,
        nonce: options.nonce,
        auto_select: false,
        ux_mode: 'popup',
        callback: (response: unknown): void => {
          const credential: string | null = readCredential(response);
          if (credential !== null) options.onCredential(credential);
        },
      });
      mount.replaceChildren();
      api.renderButton(mount, { type: 'standard', theme: 'filled_black', size: 'medium', shape: 'rectangular', text: 'signin_with', logo_alignment: 'left', locale: GOOGLE_IDENTITY.locale, width: GOOGLE_IDENTITY.buttonWidth });
    },
  };
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
