import { readLootFilter } from '../../sim/loot-filter.ts';
import type { LootFilter } from '../../sim/loot-filter.ts';
import type { ActionDef, Movement, Overrides } from './bindings.ts';
import { DEFAULT_MOVEMENT, MOVEMENTS, sanitizeOverrides } from './bindings.ts';

export const QUALITIES = ['low', 'medium', 'high'] as const;
export type Quality = (typeof QUALITIES)[number];

export const SETTINGS_SECTIONS = ['graphics', 'sound', 'controls', 'loot'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export interface GraphicsPreset {
  readonly pixelRatioCap: number;
  readonly shadows: boolean;
  readonly shadowSize: number;
  readonly bloom: boolean;
  readonly lights: number;
  readonly effectsDensity: number;
}

export const PRESETS: Readonly<Record<Quality, GraphicsPreset>> = {
  low: { pixelRatioCap: 1, shadows: false, shadowSize: 1024, bloom: false, lights: 2, effectsDensity: 0.35 },
  medium: { pixelRatioCap: 1.25, shadows: true, shadowSize: 1024, bloom: true, lights: 4, effectsDensity: 0.7 },
  high: { pixelRatioCap: 1.5, shadows: true, shadowSize: 2048, bloom: true, lights: 6, effectsDensity: 1 },
};

export interface GraphicsSettings {
  readonly quality: Quality;
  readonly showFps: boolean;
  readonly lensWater: boolean;
  readonly streakEffects: boolean;
}

export const HELD_SKILLS = ['hold', 'toggle'] as const;

export type HeldSkills = (typeof HELD_SKILLS)[number];

export interface Settings {
  readonly loot: LootFilter;
  readonly graphics: GraphicsSettings;
  readonly controls: Overrides;
  readonly movement: Movement;
  readonly heldSkills: HeldSkills;
}

export const SETTINGS_KEY: string = 'the-lost-storm.settings.v1';

export const DEFAULT_GRAPHICS: GraphicsSettings = { quality: 'high', showFps: false, lensWater: true, streakEffects: true };
export const DEFAULT_HELD_SKILLS: HeldSkills = 'hold';
export const DEFAULT_SETTINGS: Settings = { loot: {}, graphics: DEFAULT_GRAPHICS, controls: {}, movement: DEFAULT_MOVEMENT, heldSkills: DEFAULT_HELD_SKILLS };

function fieldOf(source: unknown, key: string): unknown {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) return undefined;
  return Object.entries(source).find(([name]: [string, unknown]): boolean => name === key)?.[1];
}

function qualityOf(value: unknown): Quality {
  return QUALITIES.find((quality: Quality): boolean => quality === value) ?? DEFAULT_GRAPHICS.quality;
}

function heldSkillsOf(value: unknown): HeldSkills {
  return HELD_SKILLS.find((mode: HeldSkills): boolean => mode === value) ?? DEFAULT_HELD_SKILLS;
}

function overridesOf(value: unknown): Overrides {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const found: Record<string, readonly string[]> = {};
  for (const [action, list] of Object.entries(value)) {
    if (!Array.isArray(list)) continue;
    const codes: unknown[] = list;
    if (codes.every((code: unknown): code is string => typeof code === 'string')) found[action] = codes.filter((code: unknown): code is string => typeof code === 'string');
  }
  return found;
}

function parsedOf(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return undefined;
  }
}

function movementOf(value: unknown): Movement {
  return MOVEMENTS.find((movement: Movement): boolean => movement === value) ?? DEFAULT_MOVEMENT;
}

export function readMovement(text: string | null): Movement {
  return movementOf(fieldOf(parsedOf(text), 'movement'));
}

export function readSettings(text: string | null, table: readonly ActionDef[]): Settings {
  const parsed: unknown = parsedOf(text);
  if (parsed === undefined) return DEFAULT_SETTINGS;
  const graphics: unknown = fieldOf(parsed, 'graphics');
  const showFps: unknown = fieldOf(graphics, 'showFps');
  const lensWater: unknown = fieldOf(graphics, 'lensWater');
  const streakEffects: unknown = fieldOf(graphics, 'streakEffects');
  return {
    graphics: {
      quality: qualityOf(fieldOf(graphics, 'quality')),
      showFps: typeof showFps === 'boolean' ? showFps : DEFAULT_GRAPHICS.showFps,
      lensWater: typeof lensWater === 'boolean' ? lensWater : DEFAULT_GRAPHICS.lensWater,
      streakEffects: typeof streakEffects === 'boolean' ? streakEffects : DEFAULT_GRAPHICS.streakEffects,
    },
    loot: readLootFilter(fieldOf(parsed, 'loot')),
    controls: sanitizeOverrides(table, overridesOf(fieldOf(parsed, 'controls'))),
    movement: movementOf(fieldOf(parsed, 'movement')),
    heldSkills: heldSkillsOf(fieldOf(parsed, 'heldSkills')),
  };
}

export function mergeSettings(current: Settings, change: Partial<Settings>): Settings {
  return { loot: change.loot ?? current.loot, graphics: change.graphics ?? current.graphics, controls: change.controls ?? current.controls, movement: change.movement ?? current.movement, heldSkills: change.heldSkills ?? current.heldSkills };
}

export function describePreset(preset: GraphicsPreset): string {
  const shadows: string = preset.shadows ? `shadows ${preset.shadowSize}` : 'no shadows';
  return `pixels x${preset.pixelRatioCap} · ${shadows} · bloom ${preset.bloom ? 'on' : 'off'} · ${preset.lights} lights · effects ${Math.round(preset.effectsDensity * 100)}%`;
}
