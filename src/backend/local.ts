import { isFields } from '../../sim/content/read.ts';
import type { Content } from '../../sim/content/types.ts';
import type { SaveData } from '../../sim/save.ts';
import { readSave } from '../../sim/save.ts';
import type { Backend, BackendState, KeyValueStore } from './backend.ts';
import { epochOf } from './epoch.ts';
import type { Epochs } from './epoch.ts';

export const SAVE_KEY: string = 'the-lost-storm.save.v1';
export const UNREADABLE_KEY: string = 'the-lost-storm.save.v1.unreadable';

export function localSaveText(save: SaveData, epoch: number): string {
  return JSON.stringify({ ...save, epoch });
}

export interface LocalCopy {
  readonly save: SaveData;
  readonly epoch: number;
}

export function readLocalSave(content: Content, text: string | null): LocalCopy | null {
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isFields(parsed)) return null;
  const epoch: number | null = epochOf(parsed, 'epoch');
  const save: SaveData | null = readSave(content, parsed);
  return epoch === null || save === null ? null : { save, epoch };
}

export function unreadable(content: Content, text: string | null): boolean {
  if (text === null) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return true;
  }
  return readSave(content, parsed) === null;
}

function keepUnreadable(content: Content, store: KeyValueStore, text: string | null): boolean {
  if (text === null || store.read(UNREADABLE_KEY) !== null || !unreadable(content, text)) return false;
  return store.write(UNREADABLE_KEY, text);
}

export function createLocalBackend(content: Content, store: KeyValueStore, epochs: Epochs): Backend {
  let setAside: boolean = false;
  return {
    load: (): Promise<SaveData | null> => {
      const text: string | null = store.read(SAVE_KEY);
      const stored: LocalCopy | null = readLocalSave(content, text);
      if (stored === null) {
        setAside = keepUnreadable(content, store, text) || setAside;
        return Promise.resolve(null);
      }
      if (stored.epoch >= epochs.current()) return Promise.resolve(stored.save);
      epochs.drop();
      store.remove(SAVE_KEY);
      return Promise.resolve(null);
    },
    save: (save: SaveData): boolean => store.write(SAVE_KEY, localSaveText(save, epochs.current())),
    reset: (): Promise<void> => {
      store.remove(SAVE_KEY);
      return Promise.resolve();
    },
    flush: (): void => undefined,
    sync: (): Promise<void> => Promise.resolve(),
    onFold: (): void => undefined,
    state: (): BackendState => 'offline',
    subscribe: (): void => undefined,
    freshStart: (): boolean => epochs.dropped(),
    setAside: (): boolean => setAside,
  };
}
