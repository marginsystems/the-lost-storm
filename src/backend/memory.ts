import type { Content } from '../../sim/content/types.ts';
import type { Backend, KeyValueStore } from './backend.ts';
import { createEpochs, SAVE_EPOCH } from './epoch.ts';
import { createLocalBackend } from './local.ts';

export function createMemoryStore(): KeyValueStore {
  const entries: Map<string, string> = new Map<string, string>();
  return {
    read: (key: string): string | null => entries.get(key) ?? null,
    write(key: string, value: string): boolean {
      entries.set(key, value);
      return true;
    },
    remove(key: string): void {
      entries.delete(key);
    },
  };
}

export function createMemoryBackend(content: Content): Backend {
  return createLocalBackend(content, createMemoryStore(), createEpochs(SAVE_EPOCH));
}
