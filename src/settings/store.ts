import type { LootFilter } from '../../sim/loot-filter.ts';
import type { KeyValueStore } from '../backend/backend.ts';
import type { ActionDef, ActionId, Movement, Overrides, RebindResult, ResolvedKeys, SlotDefault, Shipped } from './bindings.ts';
import { actionTable, freeMoveKeys, rebind, resolveKeys, sanitizeOverrides } from './bindings.ts';
import type { GraphicsPreset, GraphicsSettings, HeldSkills, Quality, Settings } from './settings.ts';
import { mergeSettings, PRESETS, readMovement, readSettings, SETTINGS_KEY } from './settings.ts';

export interface SettingsStore {
  get(): Settings;
  keys(): ResolvedKeys;
  preset(): GraphicsPreset;
  setLoot(filter: LootFilter): void;
  setQuality(quality: Quality): void;
  setShowFps(show: boolean): void;
  setLensWater(on: boolean): void;
  setStreakEffects(on: boolean): void;
  setMovement(movement: Movement): void;
  setHeldSkills(mode: HeldSkills): void;
  rebind(action: ActionId, code: string): RebindResult;
  resetControls(): void;
  saved(): boolean;
  subscribe(listener: (settings: Settings) => void): void;
}

export function createSettingsStore(storage: KeyValueStore, slots: readonly SlotDefault[], build: Shipped): SettingsStore {
  const stored: string | null = storage.read(SETTINGS_KEY);
  let table: readonly ActionDef[] = actionTable(slots, build, readMovement(stored));
  let settings: Settings = readSettings(stored, table);
  let keys: ResolvedKeys = resolveKeys(table, settings.controls);
  let saved = true;
  const listeners: ((settings: Settings) => void)[] = [];
  const commit = (next: Settings): void => {
    settings = next;
    keys = resolveKeys(table, next.controls);
    saved = storage.write(SETTINGS_KEY, JSON.stringify(next));
    for (const listener of listeners) listener(next);
  };
  const setControls = (controls: Overrides): void => {
    commit(mergeSettings(settings, { controls }));
  };
  const setGraphics = (graphics: GraphicsSettings): void => {
    if (graphics.quality === settings.graphics.quality && graphics.showFps === settings.graphics.showFps && graphics.lensWater === settings.graphics.lensWater && graphics.streakEffects === settings.graphics.streakEffects) return;
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
    setLoot(loot: LootFilter): void {
      commit(mergeSettings(settings, { loot }));
    },
    setQuality(quality: Quality): void {
      setGraphics({ ...settings.graphics, quality });
    },
    setShowFps(showFps: boolean): void {
      setGraphics({ ...settings.graphics, showFps });
    },
    setLensWater(lensWater: boolean): void {
      setGraphics({ ...settings.graphics, lensWater });
    },
    setStreakEffects(streakEffects: boolean): void {
      setGraphics({ ...settings.graphics, streakEffects });
    },
    setMovement(movement: Movement): void {
      if (movement === settings.movement) return;
      table = actionTable(slots, build, movement);
      commit(mergeSettings(settings, { movement, controls: sanitizeOverrides(table, movement === 'keys' ? freeMoveKeys(settings.controls) : settings.controls) }));
    },
    setHeldSkills(heldSkills: HeldSkills): void {
      if (heldSkills !== settings.heldSkills) commit(mergeSettings(settings, { heldSkills }));
    },
    rebind(action: ActionId, code: string): RebindResult {
      const result: RebindResult = rebind(table, settings.controls, action, code);
      if (result.kind === 'ok') setControls(result.overrides);
      return result;
    },
    resetControls(): void {
      if (Object.keys(settings.controls).length > 0) setControls({});
    },
    saved(): boolean {
      return saved;
    },
    subscribe(listener: (next: Settings) => void): void {
      listeners.push(listener);
    },
  };
}
