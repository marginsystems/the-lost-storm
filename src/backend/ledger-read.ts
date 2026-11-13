import type { Fields } from '../../sim/content/read.ts';
import { isFields } from '../../sim/content/read.ts';
import type { Content } from '../../sim/content/types.ts';
import { LEDGER_ID } from '../../sim/world/ledger.ts';
import type { LedgerItem } from '../../sim/world/ledger.ts';
import type { RolledAffix } from '../../sim/world/types.ts';

export const LEDGER_READ: { readonly maxAffixes: number } = {
  maxAffixes: 16,
};

function whole(source: Fields, key: string, min: number, max: number): number | null {
  const value: unknown = source[key];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}

function readAffix(content: Content, value: unknown): RolledAffix | null {
  if (!isFields(value)) return null;
  const affix: unknown = value['affix'];
  const rolled: unknown = value['value'];
  if (typeof affix !== 'string' || !content.affixes.has(affix) || typeof rolled !== 'number' || !Number.isFinite(rolled)) return null;
  return { affix, value: rolled };
}

export function readLedgerItem(content: Content, value: unknown): LedgerItem | null {
  if (!isFields(value)) return null;
  const id: unknown = value['id'];
  const base: unknown = value['base'];
  const rarity: unknown = value['rarity'];
  const level: number | null = whole(value, 'level', 1, content.player.xp.maxLevel);
  const affixes: unknown = value['affixes'];
  if (typeof id !== 'string' || !LEDGER_ID.test(id) || typeof base !== 'string' || !content.itemBases.has(base) || level === null) return null;
  if (typeof rarity !== 'string' || !content.rarities.some((entry): boolean => entry.id === rarity)) return null;
  if (!Array.isArray(affixes) || affixes.length > LEDGER_READ.maxAffixes) return null;
  const list: readonly unknown[] = affixes;
  const rolled: (RolledAffix | null)[] = list.map((entry: unknown): RolledAffix | null => readAffix(content, entry));
  if (!rolled.every((entry: RolledAffix | null): boolean => entry !== null)) return null;
  return { id, base, rarity, level, affixes: rolled.filter((entry: RolledAffix | null): entry is RolledAffix => entry !== null) };
}
