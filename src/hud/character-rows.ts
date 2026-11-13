import type { CharacterSheet, Figure } from '../../sim/character-sheet.ts';
import type { StatId } from '../../sim/content/types.ts';
import { ARMOUR_HALF_POINT } from '../../sim/stats.ts';

export type Source = 'base' | 'gear' | 'tree' | 'total';

export interface SheetRow {
  readonly name: string;
  readonly note: string | null;
  readonly read: (sheet: CharacterSheet, source: Source) => readonly number[];
  readonly format: (values: readonly number[]) => string;
}

const whole = (values: readonly number[]): string => String(Math.round(values[0] ?? 0));
const tenths = (values: readonly number[]): string => (values[0] ?? 0).toFixed(1);
const perSecond = (values: readonly number[]): string => `${tenths(values)}/s`;
const percent = (values: readonly number[]): string => `${Math.round((values[0] ?? 0) * 100)}%`;
const bonus = (values: readonly number[]): string => `+${percent(values)}`;
const percentTenth = (values: readonly number[]): string => `${((values[0] ?? 0) * 100).toFixed(1)}%`;
const range = (values: readonly number[]): string => `${Math.round(values[0] ?? 0)}–${Math.round(values[1] ?? 0)}`;

function stat(sheet: CharacterSheet, id: StatId, source: Source): number {
  const figure: Figure = sheet.figures[id];
  return source === 'total' ? figure.total : figure[source];
}

function single(name: string, id: StatId, format: SheetRow['format']): SheetRow {
  return { name, note: null, read: (sheet: CharacterSheet, source: Source): readonly number[] => [stat(sheet, id, source)], format };
}

export const DEFENCE_ROWS: readonly SheetRow[] = [
  single('Life', 'maxLife', whole),
  single('Mana', 'maxMana', whole),
  single('Life regeneration', 'lifeRegen', perSecond),
  single('Mana regeneration', 'manaRegen', perSecond),
  single('Armour', 'armour', whole),
  {
    name: 'Hit reduction',
    note: `Every hit taken is cut by armour ÷ (armour + ${ARMOUR_HALF_POINT}), at any level.`,
    read: (sheet: CharacterSheet, source: Source): readonly number[] => (source === 'total' ? [sheet.armourReduction] : [0]),
    format: percent,
  },
  {
    name: 'Storm resistance',
    note: 'Cuts storm hits, up to the cap. Deeper storm tiers take some of it away.',
    read: (sheet: CharacterSheet, source: Source): readonly number[] => [stat(sheet, 'stormResist', source)],
    format: percent,
  },
  {
    name: 'Frost resistance',
    note: 'Cuts frost hits, up to the cap. Deeper storm tiers take some of it away.',
    read: (sheet: CharacterSheet, source: Source): readonly number[] => [stat(sheet, 'frostResist', source)],
    format: percent,
  },
  single('Movement speed', 'moveSpeed', tenths),
];

export const OFFENCE_ROWS: readonly SheetRow[] = [
  {
    name: 'Weapon damage',
    note: null,
    read: (sheet: CharacterSheet, source: Source): readonly number[] => [stat(sheet, 'damageMin', source), stat(sheet, 'damageMax', source)],
    format: range,
  },
  single('Damage bonus', 'damagePercent', bonus),
  single('Attack speed', 'attackSpeed', percent),
  single('Critical chance', 'critChance', percentTenth),
  single('Critical multiplier', 'critMultiplier', percent),
  single('Gold found', 'goldFind', percent),
];

export const SOURCES: readonly { readonly source: Source; readonly title: string }[] = [
  { source: 'base', title: 'Base' },
  { source: 'gear', title: 'Gear' },
  { source: 'tree', title: 'Skill Tree' },
];
