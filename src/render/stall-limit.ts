import type { Timers } from '../backend/backend.ts';

export const STALL = {
  limitMs: 30_000,
} as const;

export class LoadStalled extends Error {}

export function withStallLimit<T>(start: (progress: () => void) => Promise<T>, timers: Timers, limitMs: number, what: string): Promise<T> {
  return new Promise<T>((resolve: (value: T) => void, reject: (reason: unknown) => void): void => {
    let settled: boolean = false;
    const fire = (): void => {
      if (settled) return;
      settled = true;
      reject(new LoadStalled(`${what} stopped loading`));
    };
    let cancel: () => void = timers.after(limitMs, fire);
    const progress = (): void => {
      if (settled) return;
      cancel();
      cancel = timers.after(limitMs, fire);
    };
    const finish = async (): Promise<void> => {
      try {
        const value: T = await start(progress);
        if (settled) return;
        settled = true;
        cancel();
        resolve(value);
      } catch (error: unknown) {
        if (settled) return;
        settled = true;
        cancel();
        reject(error);
      }
    };
    void finish();
  });
}
