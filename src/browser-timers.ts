import type { Timers } from './backend/backend.ts';

export function createBrowserTimers(): Timers {
  return {
    after: (ms: number, task: () => void): (() => void) => {
      const handle: number = window.setTimeout(task, ms);
      return (): void => {
        window.clearTimeout(handle);
      };
    },
  };
}
