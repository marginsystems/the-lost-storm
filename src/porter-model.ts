import { createPorterSteering } from '../sim/rl/porter-steering.ts';
import { RESIDENT_MODEL_PATH } from '../sim/rl/resident-model.ts';
import type { PorterSteering } from '../sim/world/porter.ts';
import { assetUrl } from './render/asset-url.ts';
import type { PorterRequest } from './porter-worker.ts';

const RETRY_MS: number = 30_000;

export function browserPorterSteering(warn: (message: string) => void): PorterSteering {
  let worker: Worker | null = null;
  let readyAt: number = 0;
  let pending: ((move: number) => void) | null = null;
  const failed = (reason: string): void => {
    worker?.terminate();
    worker = null;
    pending = null;
    readyAt = performance.now() + RETRY_MS;
    warn('Porter movement model unavailable: ' + reason);
  };
  return createPorterSteering((obs: Float32Array, mask: Uint8Array, answer: (move: number) => void): boolean => {
    if (pending !== null || performance.now() < readyAt) return false;
    try {
      if (worker === null) {
        worker = new Worker(new URL('./porter-worker.ts', import.meta.url), { type: 'module' });
        worker.addEventListener('error', (event: ErrorEvent): void => failed(event.message));
        worker.addEventListener('messageerror', (): void => failed('unreadable worker reply'));
        worker.addEventListener('message', (event: MessageEvent<unknown>): void => {
          if (typeof event.data !== 'number') {
            failed(String(event.data));
            return;
          }
          pending?.(event.data);
          pending = null;
        });
      }
      pending = answer;
      const url: string = new URL(assetUrl(RESIDENT_MODEL_PATH), document.baseURI).href;
      worker.postMessage({ url, obs, mask } satisfies PorterRequest, [obs.buffer]);
      return true;
    } catch (error) {
      failed(String(error));
      return false;
    }
  });
}
