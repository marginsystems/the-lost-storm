import type { SaveData } from '../../sim/save.ts';
import type { Backend, BackendState, SaveOptions } from './backend.ts';
import type { SaveFold } from './purse-read.ts';

export interface SwitchableBackend extends Backend {
  retire(): void;
  reopen(): Promise<SaveData | null>;
}

export function createSwitchableBackend(make: () => Backend): SwitchableBackend {
  const stateListeners: ((state: BackendState) => void)[] = [];
  const foldListeners: ((fold: SaveFold) => void)[] = [];
  const heldFolds: SaveFold[] = [];
  let current: Backend = make();
  let retired: boolean = false;
  const attach = (inner: Backend): void => {
    inner.subscribe((state: BackendState): void => {
      if (inner !== current) return;
      for (const listener of stateListeners) listener(state);
    });
    inner.onFold((fold: SaveFold): void => {
      if (inner !== current) return;
      if (foldListeners.length === 0) heldFolds.push(fold);
      for (const listener of foldListeners) listener(fold);
    });
  };
  attach(current);
  const retire = (): void => {
    if (retired) return;
    retired = true;
    current.flush();
    current.leave();
    current.close();
  };
  return {
    load: (): Promise<SaveData | null> => current.load(),
    save: (save: SaveData, options?: SaveOptions): boolean => (retired ? true : current.save(save, options)),
    reset: (): Promise<void> => current.reset(),
    flush: (): void => current.flush(),
    leave: (): void => current.leave(),
    close: (): void => current.close(),
    sync: (): Promise<void> => current.sync(),
    onFold(listener: (fold: SaveFold) => void): void {
      foldListeners.push(listener);
      for (const fold of heldFolds.splice(0, heldFolds.length)) listener(fold);
    },
    state: (): BackendState => current.state(),
    subscribe(listener: (state: BackendState) => void): void {
      stateListeners.push(listener);
    },
    freshStart: (): boolean => current.freshStart(),
    setAside: (): boolean => current.setAside(),
    retire,
    async reopen(): Promise<SaveData | null> {
      retire();
      const next: Backend = make();
      current = next;
      retired = false;
      attach(next);
      const before: BackendState = next.state();
      for (const listener of stateListeners) listener(before);
      return next.load();
    },
  };
}
