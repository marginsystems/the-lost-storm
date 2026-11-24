import type { Palette } from '../skill-art/kit.ts';

export const TINT_MIX = {
  night: '#04060b',
  white: '#ffffff',
  deep: 0.86,
  core: 0.5,
  light: 0.72,
} as const;

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const HEX: RegExp = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

function rgb(hex: string): Rgb {
  const match: RegExpExecArray | null = HEX.exec(hex);
  if (match === null) return { r: 160, g: 170, b: 180 };
  return { r: Number.parseInt(match[1] ?? '0', 16), g: Number.parseInt(match[2] ?? '0', 16), b: Number.parseInt(match[3] ?? '0', 16) };
}

function channel(value: number): string {
  return Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0');
}

export function mixHex(from: string, to: string, amount: number): string {
  const a: Rgb = rgb(from);
  const b: Rgb = rgb(to);
  const at = (x: number, y: number): string => channel(x + (y - x) * amount);
  return `#${at(a.r, b.r)}${at(a.g, b.g)}${at(a.b, b.b)}`;
}

export function tintPalette(tint: string): Palette {
  const hot: string = mixHex(tint, tint, 0);
  return {
    deep: mixHex(hot, TINT_MIX.night, TINT_MIX.deep),
    core: mixHex(hot, TINT_MIX.night, TINT_MIX.core),
    hot,
    light: mixHex(hot, TINT_MIX.white, TINT_MIX.light),
  };
}
