import type { KeyValueStore } from './backend/backend.ts';

export function createBrowserStore(): KeyValueStore {
  return {
    read(key: string): string | null {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    write(key: string, value: string): boolean {
      try {
        window.localStorage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
    remove(key: string): void {
      try {
        window.localStorage.removeItem(key);
      } catch {
        return;
      }
    },
  };
}
