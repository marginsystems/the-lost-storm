import type { SaveData } from '../sim/save.ts';

const SAVE_KEY: string = 'the-lost-storm.save.v1';

export function readSaveText(): string | null {
  try {
    return window.localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

export function writeSave(save: SaveData): boolean {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    return;
  }
}
