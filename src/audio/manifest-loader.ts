import type { AssetManifest } from './manifest.ts';
import { assetUrl, parseManifest } from './manifest.ts';

const MANIFEST_NAME: string = 'manifest.json';

export interface ManifestLoaderOptions {
  readonly base: string | null;
  readonly clock: () => number;
  readonly retrySeconds: number;
  readonly timeoutMs: number;
  readonly fetchJson: (url: string, signal: AbortSignal) => Promise<unknown>;
}

export interface ManifestLoader {
  current(): AssetManifest | null;
  ready(): Promise<void>;
  ensure(): void;
  onLoaded(listener: (manifest: AssetManifest) => void): void;
}

export function createManifestLoader(options: ManifestLoaderOptions): ManifestLoader {
  const url: string | null = options.base === null ? null : assetUrl(options.base, MANIFEST_NAME);
  const listeners: ((manifest: AssetManifest) => void)[] = [];
  let manifest: AssetManifest | null = null;
  let loading: boolean = false;
  let failedAt: number | null = null;
  let running: Promise<void> = Promise.resolve();

  const fetchWithin = async (target: string): Promise<unknown> => {
    const controller: AbortController = new AbortController();
    const expired: Promise<never> = new Promise<never>((_resolve: (value: never) => void, reject: (reason: Error) => void): void => {
      controller.signal.addEventListener('abort', (): void => reject(new Error('manifest request timed out')), { once: true });
    });
    const timer: ReturnType<typeof setTimeout> = setTimeout((): void => controller.abort(), options.timeoutMs);
    try {
      return await Promise.race([options.fetchJson(target, controller.signal), expired]);
    } finally {
      clearTimeout(timer);
    }
  };

  const run = async (target: string): Promise<void> => {
    try {
      const parsed: AssetManifest | null = parseManifest(await fetchWithin(target));
      if (parsed === null) {
        failedAt = options.clock();
      } else {
        manifest = parsed;
        failedAt = null;
        for (const listener of listeners) listener(parsed);
      }
    } catch {
      failedAt = options.clock();
    } finally {
      loading = false;
    }
  };

  return {
    current(): AssetManifest | null {
      return manifest;
    },
    ready(): Promise<void> {
      return running;
    },
    ensure(): void {
      if (url === null || manifest !== null || loading) return;
      if (failedAt !== null && options.clock() - failedAt < options.retrySeconds) return;
      loading = true;
      running = run(url);
    },
    onLoaded(listener: (loaded: AssetManifest) => void): void {
      listeners.push(listener);
    },
  };
}
