import type { Content } from '../../sim/content/types.ts';
import { createBrowserTimers } from '../browser-timers.ts';
import { createBrowserStore } from '../storage.ts';
import type { Backend } from './backend.ts';
import { createConsoleLogger } from './console-log.ts';
import { createBackend } from './create.ts';

export function createBrowserBackend(content: Content, rawUrl: string | undefined): Backend {
  return createBackend(content, rawUrl, {
    fetch: (url: string, init: RequestInit): Promise<Response> => fetch(url, init),
    store: createBrowserStore(),
    clock: (): number => Date.now(),
    timers: createBrowserTimers(),
    log: createConsoleLogger(),
  });
}
