import type { KeyValueStore } from '../backend/backend.ts';
import type { ActionDef, ActionId, Overrides, RebindResult, ResolvedKeys, SlotDefault } from './bindings.ts';
import { actionTable, rebind, resolveKeys } from './bindings.ts';
import type { GraphicsPreset, GraphicsSettings, Quality, Settings } from './settings.ts';
import { mergeSettings, PRESETS, readSettings, SETTINGS_KEY } from './settings.ts';

export interface SettingsStore {
  get(): Settings;
  keys(): ResolvedKeys;
  preset(): GraphicsPreset;
  setQuality(quality: Quality): void;
  setShowFps(show: boolean): void;
  rebind(action: ActionId, code: string): RebindResult;
  resetControls(): void;
  subscribe(listener: (settings: Settings) => void): void;
}

export function createSettingsStore(storage: KeyValueStore, slots: readonly SlotDefault[], flasks: number): SettingsStore {
  const table: readonly ActionDef[] = actionTable(slots, flasks);
  let settings: Settings = readSettings(storage.read(SETTINGS_KEY), table);
  let keys: ResolvedKeys = resolveKeys(table, settings.controls);
  const listeners: ((settings: Settings) => void)[] = [];
  const commit = (next: Settings): void => {
    settings = next;
    keys = resolveKeys(table, next.controls);
    storage.write(SETTINGS_KEY, JSON.stringify(next));
    for (const listener of listeners) listener(next);
  };
  const setControls = (controls: Overrides): void => {
    commit(mergeSettings(settings, { controls }));
  };
  const setGraphics = (graphics: GraphicsSettings): void => {
    if (graphics.quality === settings.graphics.quality && graphics.showFps === settings.graphics.showFps) return;
    commit(mergeSettings(settings, { graphics }));
  };
  return {
    get(): Settings {
      return settings;
    },
    keys(): ResolvedKeys {
      return keys;
    },
    preset(): GraphicsPreset {
      return PRESETS[settings.graphics.quality];
    },
    setQuality(quality: Quality): void {
      setGraphics({ ...settings.graphics, quality });
    },
    setShowFps(showFps: boolean): void {
      setGraphics({ ...settings.graphics, showFps });
    },
    rebind(action: ActionId, code: string): RebindResult {
      const result: RebindResult = rebind(table, settings.controls, action, code);
      if (result.kind === 'ok') setControls(result.overrides);
      return result;
    },
    resetControls(): void {
      if (Object.keys(settings.controls).length > 0) setControls({});
    },
    subscribe(listener: (next: Settings) => void): void {
      listeners.push(listener);
    },
  };
}
