import { isFields } from '../../sim/content/read.ts';
import type { Fields } from '../../sim/content/read.ts';

export interface LadderRow {
  readonly rank: number;
  readonly name: string;
  readonly level: number;
  readonly online: boolean;
}

export interface Ladder {
  readonly top: readonly LadderRow[];
  readonly online: number;
}

export type LadderFetch = (url: string, init: RequestInit) => Promise<Response>;

export const LADDER: { readonly rows: number; readonly nameChars: number; readonly timeoutMs: number } = { rows: 10, nameChars: 32, timeoutMs: 4000 };

function wholeNumber(source: Fields, key: string, min: number): number | null {
  const value: unknown = source[key];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min ? value : null;
}

function readRow(value: unknown): LadderRow | null {
  if (!isFields(value)) return null;
  const rank: number | null = wholeNumber(value, 'rank', 1);
  const level: number | null = wholeNumber(value, 'level', 1);
  const name: unknown = value['name'];
  const online: unknown = value['online'];
  if (rank === null || level === null || typeof name !== 'string' || name === '' || name.length > LADDER.nameChars || typeof online !== 'boolean') return null;
  return { rank, name, level, online };
}

export function readLadder(value: unknown): Ladder | null {
  if (!isFields(value)) return null;
  const online: number | null = wholeNumber(value, 'online', 0);
  const list: unknown = value['top'];
  if (online === null || !Array.isArray(list)) return null;
  const entries: readonly unknown[] = list;
  const rows: (LadderRow | null)[] = entries.slice(0, LADDER.rows).map(readRow);
  const top: LadderRow[] = rows.filter((row: LadderRow | null): row is LadderRow => row !== null);
  return top.length === rows.length ? { top, online } : null;
}

export async function fetchLadder(serverUrl: string, fetchFn: LadderFetch): Promise<Ladder | null> {
  try {
    const response: Response = await fetchFn(`${serverUrl}/v1/leaderboard`, { method: 'GET', signal: AbortSignal.timeout(LADDER.timeoutMs) });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return readLadder(body);
  } catch {
    return null;
  }
}
