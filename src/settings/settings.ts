import type { ActionDef, Overrides } from './bindings.ts';
import { sanitizeOverrides } from './bindings.ts';

export const QUALITIES = ['low', 'medium', 'high'] as const;
export type Quality = (typeof QUALITIES)[number];

export const SETTINGS_SECTIONS = ['graphics', 'sound', 'controls'] as const;
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
}

export interface Settings {
  readonly graphics: GraphicsSettings;
  readonly controls: Overrides;
}

export const SETTINGS_KEY: string = 'the-lost-storm.settings.v1';

export const DEFAULT_GRAPHICS: GraphicsSettings = { quality: 'high', showFps: false, lensWater: true };
export const DEFAULT_SETTINGS: Settings = { graphics: DEFAULT_GRAPHICS, controls: {} };

function fieldOf(source: unknown, key: string): unknown {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) return undefined;
  return Object.entries(source).find(([name]: [string, unknown]): boolean => name === key)?.[1];
}

function qualityOf(value: unknown): Quality {
  return QUALITIES.find((quality: Quality): boolean => quality === value) ?? DEFAULT_GRAPHICS.quality;
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

export function readSettings(text: string | null, table: readonly ActionDef[]): Settings {
  if (text === null) return DEFAULT_SETTINGS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return DEFAULT_SETTINGS;
  }
  const graphics: unknown = fieldOf(parsed, 'graphics');
  const showFps: unknown = fieldOf(graphics, 'showFps');
  const lensWater: unknown = fieldOf(graphics, 'lensWater');
  return {
    graphics: {
      quality: qualityOf(fieldOf(graphics, 'quality')),
      showFps: typeof showFps === 'boolean' ? showFps : DEFAULT_GRAPHICS.showFps,
      lensWater: typeof lensWater === 'boolean' ? lensWater : DEFAULT_GRAPHICS.lensWater,
    },
    controls: sanitizeOverrides(table, overridesOf(fieldOf(parsed, 'controls'))),
  };
}

export function mergeSettings(current: Settings, change: Partial<Settings>): Settings {
  return { graphics: change.graphics ?? current.graphics, controls: change.controls ?? current.controls };
}

export function describePreset(preset: GraphicsPreset): string {
  const shadows: string = preset.shadows ? `shadows ${preset.shadowSize}` : 'no shadows';
  return `pixels x${preset.pixelRatioCap} · ${shadows} · bloom ${preset.bloom ? 'on' : 'off'} · ${preset.lights} lights · effects ${Math.round(preset.effectsDensity * 100)}%`;
}
