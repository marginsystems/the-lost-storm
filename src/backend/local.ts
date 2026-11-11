import type { Content } from '../../sim/content/types.ts';
import type { SaveData } from '../../sim/save.ts';
import { parseSaveText } from '../../sim/save.ts';
import type { Backend, BackendState, KeyValueStore } from './backend.ts';

export const SAVE_KEY: string = 'the-lost-storm.save.v1';

export function createLocalBackend(content: Content, store: KeyValueStore): Backend {
  return {
    load: (): Promise<SaveData | null> => Promise.resolve(parseSaveText(content, store.read(SAVE_KEY))),
    save: (save: SaveData): boolean => store.write(SAVE_KEY, JSON.stringify(save)),
    reset: (): Promise<void> => {
      store.remove(SAVE_KEY);
      return Promise.resolve();
    },
    flush: (): void => undefined,
    state: (): BackendState => 'offline',
    subscribe: (): void => undefined,
  };
}
