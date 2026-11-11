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

export const GOOGLE_IDENTITY: { readonly script: string; readonly loadMs: number; readonly buttonWidth: number; readonly locale: string } = {
  script: 'https://accounts.google.com/gsi/client',
  loadMs: 8000,
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
      api.renderButton(mount, { type: 'standard', theme: 'filled_black', size: 'medium', shape: 'rectangular', text: 'signin_with', logo_alignment: 'left', locale: GOOGLE_IDENTITY.locale, width: GOOGLE_IDENTITY.buttonWidth });
    },
  };
}

export function loadGoogleIdentity(): Promise<GoogleIdentity | null> {
  const ready: GoogleIdentity | null = readIdentityApi(window);
  if (ready !== null) return Promise.resolve(ready);
  return new Promise<GoogleIdentity | null>((resolve: (identity: GoogleIdentity | null) => void): void => {
    const script: HTMLScriptElement = document.createElement('script');
    const giveUp: number = window.setTimeout((): void => {
      resolve(null);
    }, GOOGLE_IDENTITY.loadMs);
    const finish = (): void => {
      window.clearTimeout(giveUp);
      resolve(readIdentityApi(window));
    };
    script.src = GOOGLE_IDENTITY.script;
    script.async = true;
    script.addEventListener('load', finish);
    script.addEventListener('error', finish);
    document.head.append(script);
  });
}
