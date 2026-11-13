export const LOBBY_RESUME = {
  key: 'the-lost-storm.lobby-resume',
  value: '1',
  className: 'lobby-resume',
} as const;

export interface FlagStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function markResume(store: FlagStore): boolean {
  try {
    store.setItem(LOBBY_RESUME.key, LOBBY_RESUME.value);
    return true;
  } catch {
    return false;
  }
}

export function takeResume(store: FlagStore): boolean {
  try {
    const marked: boolean = store.getItem(LOBBY_RESUME.key) === LOBBY_RESUME.value;
    store.removeItem(LOBBY_RESUME.key);
    return marked;
  } catch {
    return false;
  }
}
