import { isFields } from '../../sim/content/read.ts';
import type { Content } from '../../sim/content/types.ts';
import { LEDGER_ID } from '../../sim/world/ledger.ts';
import type { LedgerItem, PurseDirection, PurseEntry, PurseKind } from '../../sim/world/ledger.ts';
import { readLedgerItem } from './ledger-read.ts';

export interface SaveFold {
  readonly folded: readonly PurseEntry[];
  readonly stripped: readonly string[];
  readonly unverified: readonly string[];
}

export const NO_FOLD: SaveFold = { folded: [], stripped: [], unverified: [] };

const PURSE_KINDS: readonly PurseKind[] = ['list', 'cancel', 'buy', 'collect'];

function kindOf(value: unknown): PurseKind | null {
  return PURSE_KINDS.find((kind: PurseKind): boolean => kind === value) ?? null;
}

function directionOf(value: unknown): PurseDirection | null | undefined {
  if (value === null) return null;
  return value === 'in' || value === 'out' ? value : undefined;
}

export function readEntry(content: Content, value: unknown): PurseEntry | null {
  if (!isFields(value)) return null;
  const id: unknown = value['id'];
  const gold: unknown = value['gold'];
  const kind: PurseKind | null = kindOf(value['kind']);
  const direction: PurseDirection | null | undefined = directionOf(value['direction']);
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1 || typeof gold !== 'number' || !Number.isSafeInteger(gold) || kind === null || direction === undefined) return null;
  if (value['item'] === null) return direction === null ? { id, kind, gold, item: null, direction } : null;
  const item: LedgerItem | null = readLedgerItem(content, value['item']);
  return item === null || direction === null ? null : { id, kind, gold, item, direction };
}

export function readEntries(content: Content, value: unknown): PurseEntry[] | null {
  if (!Array.isArray(value)) return null;
  const list: readonly unknown[] = value;
  const read: (PurseEntry | null)[] = list.map((entry: unknown): PurseEntry | null => readEntry(content, entry));
  return read.every((entry: PurseEntry | null): boolean => entry !== null) ? read.filter((entry: PurseEntry | null): entry is PurseEntry => entry !== null) : null;
}

function readLedgerIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const list: readonly unknown[] = value;
  return list.every((id: unknown): boolean => typeof id === 'string' && LEDGER_ID.test(id)) ? list.filter((id: unknown): id is string => typeof id === 'string') : null;
}

export function readFold(content: Content, body: unknown): SaveFold {
  if (!isFields(body)) return NO_FOLD;
  const folded: PurseEntry[] | null = body['folded'] === undefined ? [] : readEntries(content, body['folded']);
  const stripped: string[] | null = body['stripped'] === undefined ? [] : readLedgerIds(body['stripped']);
  const unverified: string[] | null = body['unverified'] === undefined ? [] : readLedgerIds(body['unverified']);
  return { folded: folded ?? [], stripped: stripped ?? [], unverified: unverified ?? [] };
}

export function emptyFold(fold: SaveFold): boolean {
  return fold.folded.length === 0 && fold.stripped.length === 0 && fold.unverified.length === 0;
}
