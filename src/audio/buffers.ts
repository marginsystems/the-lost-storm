import { assetUrl } from './manifest.ts';
import type { BufferCache } from './cache.ts';
import { within } from './timeout.ts';

export interface LoadOptions {
  readonly keep: boolean;
  readonly remember: boolean;
}

export const PLAY_LOAD: LoadOptions = { keep: true, remember: true };
export const LOOP_LOAD: LoadOptions = { keep: false, remember: true };
export const WARM_LOAD: LoadOptions = { keep: true, remember: false };

export interface BufferLoaderOptions<T> {
  readonly base: string | null;
  readonly clock: () => number;
  readonly cache: BufferCache<T>;
  readonly failedRetrySeconds: number;
  readonly timeoutMs: number;
  readonly ready: () => boolean;
  readonly fetchBytes: (url: string, signal: AbortSignal) => Promise<ArrayBuffer>;
  readonly decode: (bytes: ArrayBuffer) => Promise<T>;
  readonly onOutcome?: (ok: boolean) => void;
}

interface PendingLoad<T> {
  readonly promise: Promise<T | null>;
  readonly remember: boolean;
}

export interface BufferLoader<T> {
  load(path: string, how?: LoadOptions): Promise<T | null>;
}

export function createBufferLoader<T>(options: BufferLoaderOptions<T>): BufferLoader<T> {
  const pending: Map<string, PendingLoad<T>> = new Map<string, PendingLoad<T>>();
  const failed: Map<string, number> = new Map<string, number>();
  const load = (path: string, how: LoadOptions = PLAY_LOAD): Promise<T | null> => {
    const cached: T | undefined = options.cache.get(path);
    if (cached !== undefined) return Promise.resolve(cached);
    const running: PendingLoad<T> | undefined = pending.get(path);
    if (running !== undefined) {
      if (running.remember || !how.remember) return running.promise;
      return running.promise.then((joined: T | null): Promise<T | null> => (joined === null ? load(path, how) : Promise.resolve(joined)));
    }
    const lastFailure: number | undefined = failed.get(path);
    if (lastFailure !== undefined && options.clock() - lastFailure < options.failedRetrySeconds) return Promise.resolve(null);
    const url: string | null = options.base === null ? null : assetUrl(options.base, path);
    if (url === null || !options.ready()) return Promise.resolve(null);
    const request: Promise<T | null> = (async (): Promise<T | null> => {
      try {
        const decoded: T = await within(options.timeoutMs, async (signal: AbortSignal): Promise<T> => options.decode(await options.fetchBytes(url, signal)));
        if (how.keep) options.cache.set(path, decoded);
        options.onOutcome?.(true);
        return decoded;
      } catch {
        if (how.remember) failed.set(path, options.clock());
        options.onOutcome?.(false);
        return null;
      }
    })();
    pending.set(path, { promise: request, remember: how.remember });
    const release = (): void => {
      pending.delete(path);
    };
    request.then(release).catch(release);
    return request;
  };
  return { load };
}
