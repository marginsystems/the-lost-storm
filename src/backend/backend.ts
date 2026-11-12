import type { SaveData } from '../../sim/save.ts';

export type BackendState = 'offline' | 'cloud';

export interface Backend {
  load(): Promise<SaveData | null>;
  save(save: SaveData): boolean;
  reset(): Promise<void>;
  flush(): void;
  state(): BackendState;
  subscribe(listener: (state: BackendState) => void): void;
  freshStart(): boolean;
}

export interface KeyValueStore {
  read(key: string): string | null;
  write(key: string, value: string): boolean;
  remove(key: string): void;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

export interface Timers {
  after(ms: number, task: () => void): () => void;
}

export type Clock = () => number;
