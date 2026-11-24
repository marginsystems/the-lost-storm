import type { RarityDef } from '../../../sim/content/types.ts';
import { BACKDROP, COVER, halo, plateSvg, spark } from '../skill-art/kit.ts';
import type { Palette } from '../skill-art/kit.ts';
import { mixHex, TINT_MIX } from '../tree-art/palette.ts';

export const PLATE = {
  deep: 0.9,
  core: 0.72,
  light: 0.6,
  haloRadius: 17,
  haloOpacity: 0.2,
  floorOpacity: 0.42,
  maxMotes: 6,
} as const;

export interface PlateImages {
  readonly backdrop: string;
  readonly cover: string;
}

const MOTES: readonly (readonly [number, number, number])[] = [
  [9, 12, 0.9],
  [55, 15, 0.7],
  [52, 50, 0.8],
  [11, 47, 0.7],
  [32, 6, 0.6],
  [58, 33, 0.6],
];

const plates: Map<string, PlateImages> = new Map<string, PlateImages>();

export function platePalette(tint: string): Palette {
  return {
    deep: mixHex(tint, TINT_MIX.night, PLATE.deep),
    core: mixHex(tint, TINT_MIX.night, PLATE.core),
    hot: mixHex(tint, tint, 0),
    light: mixHex(tint, TINT_MIX.white, PLATE.light),
  };
}

export function moteCount(rarity: RarityDef): number {
  return Math.max(0, Math.min(PLATE.maxMotes, rarity.affixMax));
}

export function backdropSvg(rarity: RarityDef): string {
  const palette: Palette = platePalette(rarity.color);
  const motes: string = MOTES.slice(0, moteCount(rarity)).map(([x, y, r]: readonly [number, number, number]): string => spark(x, y, r, palette.light)).join('');
  const floor: string = `<ellipse cx="32" cy="53" rx="19" ry="4.2" fill="#000" opacity="${PLATE.floorOpacity}" filter="url(#bloom)"/>`;
  return plateSvg(palette, `${BACKDROP}${halo(32, 33, PLATE.haloRadius, palette.hot, PLATE.haloOpacity)}${floor}${motes}`);
}

export function coverSvg(rarity: RarityDef): string {
  return plateSvg(platePalette(rarity.color), COVER);
}

function asUrl(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function plateImages(rarity: RarityDef): PlateImages {
  const key: string = `${rarity.color}|${moteCount(rarity)}`;
  const known: PlateImages | undefined = plates.get(key);
  if (known !== undefined) return known;
  const made: PlateImages = { backdrop: asUrl(backdropSvg(rarity)), cover: asUrl(coverSvg(rarity)) };
  plates.set(key, made);
  return made;
}

export function setPlate(target: HTMLElement, rarity: RarityDef): void {
  const images: PlateImages = plateImages(rarity);
  target.style.setProperty('--rarity', rarity.color);
  target.style.setProperty('--plate', images.backdrop);
  target.style.setProperty('--plate-cover', images.cover);
}
