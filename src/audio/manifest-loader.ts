import type { AssetManifest } from './manifest.ts';
import { assetUrl, parseManifest } from './manifest.ts';
import { within } from './timeout.ts';

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
  onFailed(listener: () => void): void;
}

export function createManifestLoader(options: ManifestLoaderOptions): ManifestLoader {
  const url: string | null = options.base === null ? null : assetUrl(options.base, MANIFEST_NAME);
  const listeners: ((manifest: AssetManifest) => void)[] = [];
  const failures: (() => void)[] = [];
  let manifest: AssetManifest | null = null;
  let loading: boolean = false;
  let failedAt: number | null = null;
  let running: Promise<void> = Promise.resolve();

  const fail = (): void => {
    failedAt = options.clock();
    for (const listener of failures) listener();
  };

  const run = async (target: string): Promise<void> => {
    try {
      const parsed: AssetManifest | null = parseManifest(await within(options.timeoutMs, (signal: AbortSignal): Promise<unknown> => options.fetchJson(target, signal)));
      if (parsed === null) {
        fail();
      } else {
        manifest = parsed;
        failedAt = null;
        for (const listener of listeners) listener(parsed);
      }
    } catch {
      fail();
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
    onFailed(listener: () => void): void {
      failures.push(listener);
    },
  };
}
