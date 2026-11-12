import type { Content, RarityDef, ZoneDef } from '../../sim/content/types.ts';
import type { ZoneEncounter } from '../../sim/content/story-types.ts';
import type { GroundItem } from '../../sim/world/types.ts';

export type MarkerChoice = { readonly kind: 'none' } | { readonly kind: 'bolt' } | { readonly kind: 'shaft'; readonly step: number; readonly color: string };

const NONE: MarkerChoice = { kind: 'none' };
const BOLT: MarkerChoice = { kind: 'bolt' };

export function markerFor(content: Content, zone: ZoneDef, ground: GroundItem): MarkerChoice {
  if (ground.content.kind !== 'item') return NONE;
  if (ground.find !== null) {
    const found: string = ground.find;
    const met: ZoneEncounter | undefined = zone.void?.encounters.find((entry: ZoneEncounter): boolean => entry.id === found);
    return met?.find.type === 'item' && met.find.marker === 'bolt' ? BOLT : NONE;
  }
  const rarityId: string = ground.content.item.rarity;
  const shafted: readonly RarityDef[] = content.rarities.filter((rarity: RarityDef): boolean => rarity.marker === 'shaft');
  const step: number = shafted.findIndex((rarity: RarityDef): boolean => rarity.id === rarityId);
  const rarity: RarityDef | undefined = shafted[step];
  return rarity === undefined ? NONE : { kind: 'shaft', step, color: rarity.color };
}
