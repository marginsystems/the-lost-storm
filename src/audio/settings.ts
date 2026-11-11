export const AUDIO_CATEGORIES = ['master', 'effects', 'voice', 'ambience'] as const;
export type AudioCategory = (typeof AUDIO_CATEGORIES)[number];

export interface AudioSettings {
  readonly volumes: Readonly<Record<AudioCategory, number>>;
  readonly muted: boolean;
}

export interface SettingsStorage {
  read(): string | null;
  write(text: string): void;
}

export interface AudioControls {
  get(): AudioSettings;
  setVolume(category: AudioCategory, value: number): void;
  setMuted(muted: boolean): void;
  subscribe(listener: (settings: AudioSettings) => void): void;
}

export const DEFAULT_SETTINGS: AudioSettings = {
  volumes: { master: 0.8, effects: 0.8, voice: 1, ambience: 0.6 },
  muted: false,
};

const SETTINGS_KEY: string = 'the-lost-storm.audio.v1';

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function fieldOf(source: unknown, key: string): unknown {
  if (typeof source !== 'object' || source === null) return undefined;
  return Object.entries(source).find(([name]: [string, unknown]): boolean => name === key)?.[1];
}

function volumeOf(source: unknown, category: AudioCategory): number {
  const value: unknown = fieldOf(source, category);
  return typeof value === 'number' && Number.isFinite(value) ? clamp01(value) : DEFAULT_SETTINGS.volumes[category];
}

export function parseSettings(text: string | null): AudioSettings {
  if (text === null) return DEFAULT_SETTINGS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return DEFAULT_SETTINGS;
  }
  const volumes: unknown = fieldOf(parsed, 'volumes');
  const muted: unknown = fieldOf(parsed, 'muted');
  return {
    volumes: {
      master: volumeOf(volumes, 'master'),
      effects: volumeOf(volumes, 'effects'),
      voice: volumeOf(volumes, 'voice'),
      ambience: volumeOf(volumes, 'ambience'),
    },
    muted: typeof muted === 'boolean' ? muted : DEFAULT_SETTINGS.muted,
  };
}

export function createSettingsStore(storage: SettingsStorage): AudioControls {
  let settings: AudioSettings = parseSettings(storage.read());
  const listeners: ((settings: AudioSettings) => void)[] = [];
  const commit = (next: AudioSettings): void => {
    settings = next;
    storage.write(JSON.stringify(next));
    for (const listener of listeners) listener(next);
  };
  return {
    get(): AudioSettings {
      return settings;
    },
    setVolume(category: AudioCategory, value: number): void {
      const next: number = clamp01(value);
      if (settings.volumes[category] === next) return;
      commit({ ...settings, volumes: { ...settings.volumes, [category]: next } });
    },
    setMuted(muted: boolean): void {
      if (settings.muted === muted) return;
      commit({ ...settings, muted });
    },
    subscribe(listener: (next: AudioSettings) => void): void {
      listeners.push(listener);
    },
  };
}

export function browserSettingsStorage(): SettingsStorage {
  return {
    read(): string | null {
      try {
        return window.localStorage.getItem(SETTINGS_KEY);
      } catch {
        return null;
      }
    },
    write(text: string): void {
      try {
        window.localStorage.setItem(SETTINGS_KEY, text);
      } catch {
        return;
      }
    },
  };
}
