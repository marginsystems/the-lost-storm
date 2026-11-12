import type { KeyValueStore } from './backend/backend.ts';

export const HINTS_KEY: string = 'the-lost-storm.hints';

export interface HintRecord {
  readonly seen: readonly string[];
  readonly enabled: boolean;
}

export interface HintStore {
  read(): HintRecord | null;
  remember(id: string): void;
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
  clear(): void;
}

function readRecord(raw: string | null): HintRecord | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const seen: unknown = Reflect.get(parsed, 'seen');
  const enabled: unknown = Reflect.get(parsed, 'enabled');
  if (!Array.isArray(seen)) return null;
  const ids: readonly unknown[] = seen;
  return { seen: ids.filter((id: unknown): id is string => typeof id === 'string'), enabled: enabled !== false };
}

export function createHintStore(store: KeyValueStore): HintStore {
  const load = (): HintRecord => readRecord(store.read(HINTS_KEY)) ?? { seen: [], enabled: true };
  const save = (record: HintRecord): void => {
    store.write(HINTS_KEY, JSON.stringify(record));
  };
  return {
    read(): HintRecord | null {
      return readRecord(store.read(HINTS_KEY));
    },
    remember(id: string): void {
      const record: HintRecord = load();
      if (!record.seen.includes(id)) save({ ...record, seen: [...record.seen, id] });
    },
    isEnabled(): boolean {
      return load().enabled;
    },
    setEnabled(enabled: boolean): void {
      save({ ...load(), enabled });
    },
    clear(): void {
      store.remove(HINTS_KEY);
    },
  };
}
