import type { KeyValueStore } from '../backend/backend.ts';

export interface GlitchSettings {
  readonly glitches: boolean;
  readonly reduceFlashes: boolean;
}

export interface GlitchSettingsStore {
  get(): GlitchSettings;
  set(change: Partial<GlitchSettings>): void;
  subscribe(listener: (settings: GlitchSettings) => void): void;
}

export const GLITCH_SETTINGS_KEY: string = 'the-lost-storm.glitches.v1';
export const DEFAULT_GLITCH_SETTINGS: GlitchSettings = { glitches: true, reduceFlashes: false };

function flagOf(source: unknown, key: string, fallback: boolean): boolean {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) return fallback;
  const value: unknown = Object.entries(source).find(([name]: [string, unknown]): boolean => name === key)?.[1];
  return typeof value === 'boolean' ? value : fallback;
}

export function readGlitchSettings(text: string | null): GlitchSettings {
  if (text === null) return DEFAULT_GLITCH_SETTINGS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return DEFAULT_GLITCH_SETTINGS;
  }
  return { glitches: flagOf(parsed, 'glitches', DEFAULT_GLITCH_SETTINGS.glitches), reduceFlashes: flagOf(parsed, 'reduceFlashes', DEFAULT_GLITCH_SETTINGS.reduceFlashes) };
}

export function createGlitchSettings(store: KeyValueStore): GlitchSettingsStore {
  let current: GlitchSettings = readGlitchSettings(store.read(GLITCH_SETTINGS_KEY));
  const listeners: ((settings: GlitchSettings) => void)[] = [];
  return {
    get(): GlitchSettings {
      return current;
    },
    set(change: Partial<GlitchSettings>): void {
      current = { glitches: change.glitches ?? current.glitches, reduceFlashes: change.reduceFlashes ?? current.reduceFlashes };
      store.write(GLITCH_SETTINGS_KEY, JSON.stringify(current));
      for (const listener of listeners) listener(current);
    },
    subscribe(listener: (settings: GlitchSettings) => void): void {
      listeners.push(listener);
    },
  };
}
