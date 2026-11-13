import type { Fields } from '../../sim/content/read.ts';
import { isFields } from '../../sim/content/read.ts';
import type { Content } from '../../sim/content/types.ts';
import type { ItemSource, LedgerItem, LootTicket, MintClaim } from '../../sim/world/ledger.ts';
import { exchange, headers } from './api.ts';
import type { Answer, FetchFn } from './api.ts';
import { LEDGER_READ, readLedgerItem } from './ledger-read.ts';

export { readLedgerItem };

export interface TicketHand {
  readonly tickets: readonly LootTicket[];
  readonly lifeMs: number;
}

export type TicketAnswer = { readonly kind: 'ok'; readonly hand: TicketHand } | { readonly kind: 'refused' } | { readonly kind: 'failed' };

export type MintAnswer = { readonly kind: 'minted'; readonly item: LedgerItem } | { readonly kind: 'refused' } | { readonly kind: 'failed' };

export interface LedgerApi {
  tickets(token: string, signal: AbortSignal): Promise<TicketAnswer>;
  mint(token: string, claim: MintClaim, signal: AbortSignal): Promise<MintAnswer>;
}

export const LEDGER_API: { readonly ticketsPath: string; readonly mintPath: string; readonly maxTickets: number; readonly maxAffixes: number; readonly maxSeed: number; readonly busyCode: string } = {
  ticketsPath: '/v1/items/tickets',
  mintPath: '/v1/items/mint',
  maxTickets: 64,
  maxAffixes: LEDGER_READ.maxAffixes,
  maxSeed: 4_294_967_295,
  busyCode: 'rate_limited',
};

function whole(source: Fields, key: string, min: number, max: number): number | null {
  const value: unknown = source[key];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}

function readTicket(value: unknown): LootTicket | null {
  if (!isFields(value)) return null;
  const id: number | null = whole(value, 'id', 1, Number.MAX_SAFE_INTEGER);
  const seed: number | null = whole(value, 'seed', 0, LEDGER_API.maxSeed);
  return id === null || seed === null ? null : { id, seed };
}

export function readTicketHand(value: unknown): TicketHand | null {
  if (!isFields(value) || !Array.isArray(value['tickets'])) return null;
  const list: readonly unknown[] = value['tickets'];
  const lifeMs: number | null = whole(value, 'lifeMs', 1, Number.MAX_SAFE_INTEGER);
  if (lifeMs === null || list.length > LEDGER_API.maxTickets) return null;
  const tickets: (LootTicket | null)[] = list.map(readTicket);
  if (!tickets.every((ticket: LootTicket | null): boolean => ticket !== null)) return null;
  return { tickets: tickets.filter((ticket: LootTicket | null): ticket is LootTicket => ticket !== null), lifeMs };
}

function sourceBody(source: ItemSource): Readonly<Record<string, string>> {
  return { ...source };
}

function errorCode(body: unknown): string | null {
  const error: unknown = isFields(body) ? body['error'] : null;
  const code: unknown = isFields(error) ? error['code'] : null;
  return typeof code === 'string' ? code : null;
}

function settledKind(answer: Answer | null): 'refused' | 'failed' {
  if (answer === null || answer.status === 408 || answer.status >= 500) return 'failed';
  if (answer.status === 429 && errorCode(answer.body) === LEDGER_API.busyCode) return 'failed';
  return 'refused';
}

export function createLedgerApi(baseUrl: string, fetchFn: FetchFn, content: Content): LedgerApi {
  return {
    tickets: async (token: string, signal: AbortSignal): Promise<TicketAnswer> => {
      const answer: Answer | null = await exchange(fetchFn, `${baseUrl}${LEDGER_API.ticketsPath}`, { method: 'POST', headers: headers(token), signal });
      if (answer === null || answer.status !== 200) return { kind: settledKind(answer) };
      const hand: TicketHand | null = readTicketHand(answer.body);
      return hand === null ? { kind: 'failed' } : { kind: 'ok', hand };
    },
    mint: async (token: string, claim: MintClaim, signal: AbortSignal): Promise<MintAnswer> => {
      const body: string = JSON.stringify({ ticket: claim.ticket, source: sourceBody(claim.source), level: claim.level });
      const answer: Answer | null = await exchange(fetchFn, `${baseUrl}${LEDGER_API.mintPath}`, { method: 'POST', headers: headers(token), body, signal });
      if (answer === null || (answer.status !== 200 && answer.status !== 201)) return { kind: settledKind(answer) };
      const item: LedgerItem | null = isFields(answer.body) ? readLedgerItem(content, answer.body['item']) : null;
      return item === null ? { kind: 'failed' } : { kind: 'minted', item };
    },
  };
}
