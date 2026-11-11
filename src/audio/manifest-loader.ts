import type { AssetManifest } from './manifest.ts';
import { assetUrl, parseManifest } from './manifest.ts';

const MANIFEST_NAME: string = 'manifest.json';

export interface ManifestLoaderOptions {
  readonly base: string | null;
  readonly clock: () => number;
  readonly retrySeconds: number;
  readonly fetchJson: (url: string) => Promise<unknown>;
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

  const run = async (target: string): Promise<void> => {
    try {
      const parsed: AssetManifest | null = parseManifest(await options.fetchJson(target));
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
