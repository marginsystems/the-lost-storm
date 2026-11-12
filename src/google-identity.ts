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
  script: 'https://accounts.google.com/gsi/client?hl=en',
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
      mount.replaceChildren();
      api.renderButton(mount, { type: 'standard', theme: 'filled_black', size: 'medium', shape: 'rectangular', text: 'signin_with', logo_alignment: 'left', locale: GOOGLE_IDENTITY.locale, width: GOOGLE_IDENTITY.buttonWidth });
    },
  };
}

let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (loading !== null) return loading;
  const started: Promise<void> = new Promise<void>((resolve: () => void): void => {
    const script: HTMLScriptElement = document.createElement('script');
    script.src = GOOGLE_IDENTITY.script;
    script.async = true;
    const discard = (): void => {
      script.remove();
      loading = null;
      resolve();
    };
    script.addEventListener('load', (): void => {
      if (readIdentityApi(window) === null) discard();
      else resolve();
    });
    script.addEventListener('error', discard);
    document.head.append(script);
  });
  loading = started;
  return started;
}

export async function loadGoogleIdentity(): Promise<GoogleIdentity | null> {
  const ready: GoogleIdentity | null = readIdentityApi(window);
  if (ready !== null) return ready;
  let giveUp: number = 0;
  const tooLong: Promise<void> = new Promise<void>((resolve: () => void): void => {
    giveUp = window.setTimeout(resolve, GOOGLE_IDENTITY.loadMs);
  });
  await Promise.race([loadScript(), tooLong]);
  window.clearTimeout(giveUp);
  return readIdentityApi(window);
}
