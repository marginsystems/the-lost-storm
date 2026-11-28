import kitData from '../../data/duel-kit.json' with { type: 'json' };
import type { Fields } from '../content/read.ts';
import { ContentError, fields, text, textList } from '../content/read.ts';
import type { Content, ItemBaseDef, ItemSlot, WeaponGroup } from '../content/types.ts';
import type { RarityDef, WeaponKind } from '../content/item-types.ts';
import { ITEM_SLOTS } from '../content/types.ts';

export interface KitPiece {
  readonly slot: ItemSlot;
  readonly base: string;
}

export interface DuelKit {
  readonly rarity: string;
  readonly rareRarity: string;
  readonly weapons: readonly string[];
  readonly armour: readonly KitPiece[];
  readonly families: Readonly<Record<string, string>>;
}

const KIT_KEYS: ReadonlySet<string> = new Set<string>(['rarity', 'rareRarity', 'weapons', 'armour', 'families']);

function readArmour(raw: unknown, where: string): KitPiece[] {
  const source: Fields = fields(raw, where);
  const unknown: string[] = Object.keys(source).filter((key: string): boolean => key === 'weapon' || !ITEM_SLOTS.some((slot: ItemSlot): boolean => slot === key));
  if (unknown.length > 0) throw new ContentError(where, `${unknown.join(', ')} is not an armour slot`);
  return ITEM_SLOTS.flatMap((slot: ItemSlot): KitPiece[] => (source[slot] === undefined ? [] : [{ slot, base: text(source, slot, where) }]));
}

function readFamilies(raw: unknown, where: string): Readonly<Record<string, string>> {
  const source: Fields = fields(raw, where);
  return Object.fromEntries(Object.keys(source).map((group: string): [string, string] => [group, text(source, group, where)]));
}

export function readKit(raw: unknown, where: string): DuelKit {
  const source: Fields = fields(raw, where);
  const unknown: string[] = Object.keys(source).filter((key: string): boolean => !KIT_KEYS.has(key));
  if (unknown.length > 0) throw new ContentError(where, `unknown field ${unknown.join(', ')}`);
  return { rarity: text(source, 'rarity', where), weapons: textList(source, 'weapons', where), armour: readArmour(source['armour'], `${where}.armour`), rareRarity: text(source, 'rareRarity', where), families: readFamilies(source['families'], `${where}.families`) };
}

export const DUEL_KIT: DuelKit = readKit(kitData, 'duel kit');

export function weaponGroupOf(content: Content, base: ItemBaseDef): WeaponGroup | null {
  const kind: WeaponKind | null = base.weaponKind;
  return kind === null ? null : (content.chart.weaponGroups.find((group: WeaponGroup): boolean => group.kinds.includes(kind)) ?? null);
}

function weaponProblems(content: Content, kit: DuelKit, level: number): string[] {
  const problems: string[] = [];
  const groups: string[] = [];
  for (const id of kit.weapons) {
    const base: ItemBaseDef | undefined = content.itemBases.get(id);
    if (base === undefined || base.slot !== 'weapon') {
      problems.push(`standard weapon ${id} is not a weapon base`);
      continue;
    }
    if (base.minLevel > level) problems.push(`standard weapon ${id} needs level ${base.minLevel}, above the duel level ${level}`);
    const group: WeaponGroup | null = weaponGroupOf(content, base);
    if (group === null) problems.push(`standard weapon ${id} belongs to no weapon group`);
    else if (groups.includes(group.id)) problems.push(`standard weapon ${id} is a second ${group.name}`);
    else groups.push(group.id);
  }
  for (const group of content.chart.weaponGroups) if (!groups.includes(group.id)) problems.push(`no standard weapon is a ${group.name}`);
  return problems;
}

function armourProblems(content: Content, kit: DuelKit, level: number): string[] {
  return kit.armour.flatMap((piece: KitPiece): string[] => {
    const base: ItemBaseDef | undefined = content.itemBases.get(piece.base);
    if (base === undefined) return [`standard ${piece.slot} ${piece.base} is not an item base`];
    if (base.slot !== piece.slot) return [`standard ${piece.slot} ${piece.base} is worn on ${base.slot ?? 'no slot'}`];
    return base.minLevel > level ? [`standard ${piece.slot} ${piece.base} needs level ${base.minLevel}, above the duel level ${level}`] : [];
  });
}

function familyProblems(content: Content, kit: DuelKit): string[] {
  const bases: ItemBaseDef[] = [...content.itemBases.values()];
  const errors: string[] = [];
  for (const group of content.chart.weaponGroups) {
    const family: string | undefined = kit.families[group.id];
    const pieces: ItemBaseDef[] = bases.filter((base: ItemBaseDef): boolean => base.power !== null && base.power.family === family);
    const slots: Set<ItemSlot | null> = new Set(pieces.map((piece: ItemBaseDef): ItemSlot | null => piece.slot));
    if (pieces.length !== 3 || slots.size !== 3 || slots.has(null)) errors.push(`the duel family for ${group.name} needs three distinct equipment slots`);
    if (pieces.some((piece: ItemBaseDef): boolean => piece.slot === 'weapon' && weaponGroupOf(content, piece)?.id !== group.id)) errors.push(`the duel family weapon does not belong to ${group.name}`);
  }
  return errors;
}

export function kitProblems(content: Content, kit: DuelKit, level: number): string[] {
  const rarity: RarityDef | undefined = content.rarities.find((entry: RarityDef): boolean => entry.id === kit.rarity);
  const plain: string[] = rarity === undefined ? [`rarity ${kit.rarity} does not exist`] : rarity.affixMax > 0 ? [`rarity ${kit.rarity} rolls affixes, so it is not plain`] : [];
  const filler: RarityDef | undefined = content.rarities.find((entry: RarityDef): boolean => entry.id === kit.rareRarity);
  const rare: string[] = filler === undefined ? [`rare rarity ${kit.rareRarity} does not exist`] : filler.affixMin < 1 || filler.powers ? [`rare rarity ${kit.rareRarity} must roll affixes and carry no powers`] : [];
  return [...plain, ...rare, ...weaponProblems(content, kit, level), ...armourProblems(content, kit, level), ...familyProblems(content, kit)];
}
