import type { Fields } from '../../sim/content/read.ts';
import { isFields } from '../../sim/content/read.ts';
import type { RolledAffix } from '../../sim/world/types.ts';

export const LIVE_TRADE_VERSION: number = 1;

export const TRADE_LIMITS: {
  readonly items: number;
  readonly gold: number;
  readonly revision: number;
  readonly idChars: number;
  readonly nameChars: number;
  readonly textChars: number;
  readonly affixes: number;
  readonly level: number;
} = {
  items: 12,
  gold: 1_000_000_000,
  revision: 1_000_000_000,
  idChars: 64,
  nameChars: 32,
  textChars: 64,
  affixes: 16,
  level: 1000,
};

export interface TradeItem {
  readonly id: string;
  readonly base: string;
  readonly rarity: string;
  readonly level: number;
  readonly affixes: readonly RolledAffix[];
}

export interface TradeSide {
  readonly items: readonly TradeItem[];
  readonly gold: number;
  readonly confirmed: boolean;
}

export interface TradeGoods {
  readonly items: readonly TradeItem[];
  readonly gold: number;
}

export type TradeRefusal =
  | 'unsupported'
  | 'not_here'
  | 'no_such_player'
  | 'self'
  | 'not_accepting'
  | 'busy'
  | 'too_far'
  | 'slow_down'
  | 'changed'
  | 'no_trade'
  | 'no_room'
  | 'no_character'
  | 'too_many'
  | 'repeated'
  | 'not_yours'
  | 'story'
  | 'not_enough_gold';

export type TradeClose = 'cancelled' | 'declined' | 'expired' | 'walked_away' | 'left' | 'disconnected' | 'failed';

export const TRADE_REFUSALS: readonly TradeRefusal[] = ['unsupported', 'not_here', 'no_such_player', 'self', 'not_accepting', 'busy', 'too_far', 'slow_down', 'changed', 'no_trade', 'no_room', 'no_character', 'too_many', 'repeated', 'not_yours', 'story', 'not_enough_gold'];

export const TRADE_CLOSES: readonly TradeClose[] = ['cancelled', 'declined', 'expired', 'walked_away', 'left', 'disconnected', 'failed'];

export type TradeFrame =
  | { readonly type: 'trade_asked'; readonly from: string; readonly name: string; readonly expiresAt: number }
  | { readonly type: 'trade_open'; readonly with: string; readonly name: string }
  | { readonly type: 'trade_state'; readonly revision: number; readonly mine: TradeSide; readonly theirs: TradeSide; readonly countdownEndsAt: number | null }
  | { readonly type: 'trade_refused'; readonly reason: TradeRefusal }
  | { readonly type: 'trade_closed'; readonly reason: TradeClose }
  | { readonly type: 'trade_done'; readonly gave: TradeGoods; readonly got: TradeGoods };

function text(value: unknown, limit: number): string | null {
  return typeof value === 'string' && value !== '' && value.length <= limit ? value : null;
}

function whole(value: unknown, limit: number): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= limit ? value : null;
}

function instant(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const at: number = Date.parse(value);
  return Number.isFinite(at) ? at : null;
}

function readAffix(value: unknown): RolledAffix | null {
  if (!isFields(value)) return null;
  const affix: string | null = text(value['affix'], TRADE_LIMITS.textChars);
  const rolled: unknown = value['value'];
  return affix === null || typeof rolled !== 'number' || !Number.isFinite(rolled) ? null : { affix, value: rolled };
}

export function readTradeItem(value: unknown): TradeItem | null {
  if (!isFields(value)) return null;
  const id: string | null = text(value['id'], TRADE_LIMITS.idChars);
  const base: string | null = text(value['base'], TRADE_LIMITS.textChars);
  const rarity: string | null = text(value['rarity'], TRADE_LIMITS.textChars);
  const level: number | null = whole(value['level'], TRADE_LIMITS.level);
  const affixes: unknown = value['affixes'];
  if (id === null || base === null || rarity === null || level === null || !Array.isArray(affixes) || affixes.length > TRADE_LIMITS.affixes) return null;
  const list: readonly unknown[] = affixes;
  const rolled: RolledAffix[] = [];
  for (const entry of list) {
    const affix: RolledAffix | null = readAffix(entry);
    if (affix === null) return null;
    rolled.push(affix);
  }
  return { id, base, rarity, level, affixes: rolled };
}

function readItems(value: unknown): readonly TradeItem[] | null {
  if (!Array.isArray(value)) return null;
  const list: readonly unknown[] = value;
  if (list.length > TRADE_LIMITS.items) return null;
  const items: TradeItem[] = [];
  for (const entry of list) {
    const item: TradeItem | null = readTradeItem(entry);
    if (item === null) return null;
    items.push(item);
  }
  return items;
}

function readGoods(value: unknown): TradeGoods | null {
  if (!isFields(value)) return null;
  const items: readonly TradeItem[] | null = readItems(value['items']);
  const gold: number | null = whole(value['gold'], TRADE_LIMITS.gold);
  return items === null || gold === null ? null : { items, gold };
}

function readSide(value: unknown): TradeSide | null {
  if (!isFields(value)) return null;
  const goods: TradeGoods | null = readGoods(value);
  const confirmed: unknown = value['confirmed'];
  return goods === null || typeof confirmed !== 'boolean' ? null : { ...goods, confirmed };
}

function known<T extends string>(list: readonly T[], value: unknown): T | null {
  return list.find((entry: T): boolean => entry === value) ?? null;
}

export function readTradeFrame(source: Fields): TradeFrame | null {
  switch (source['type']) {
    case 'trade_asked': {
      const from: string | null = text(source['from'], TRADE_LIMITS.idChars);
      const name: string | null = text(source['name'], TRADE_LIMITS.nameChars);
      const expiresAt: number | null = instant(source['expiresAt']);
      return from === null || name === null || expiresAt === null ? null : { type: 'trade_asked', from, name, expiresAt };
    }
    case 'trade_open': {
      const other: string | null = text(source['with'], TRADE_LIMITS.idChars);
      const name: string | null = text(source['name'], TRADE_LIMITS.nameChars);
      return other === null || name === null ? null : { type: 'trade_open', with: other, name };
    }
    case 'trade_state': {
      const revision: number | null = whole(source['revision'], TRADE_LIMITS.revision);
      const mine: TradeSide | null = readSide(source['mine']);
      const theirs: TradeSide | null = readSide(source['theirs']);
      const ends: unknown = source['countdownEndsAt'];
      const countdownEndsAt: number | null = ends === null ? null : instant(ends);
      if (revision === null || mine === null || theirs === null || (ends !== null && countdownEndsAt === null)) return null;
      return { type: 'trade_state', revision, mine, theirs, countdownEndsAt };
    }
    case 'trade_refused': {
      const reason: TradeRefusal | null = known(TRADE_REFUSALS, source['reason']);
      return reason === null ? null : { type: 'trade_refused', reason };
    }
    case 'trade_closed': {
      const reason: TradeClose | null = known(TRADE_CLOSES, source['reason']);
      return reason === null ? null : { type: 'trade_closed', reason };
    }
    case 'trade_done': {
      const gave: TradeGoods | null = readGoods(source['gave']);
      const got: TradeGoods | null = readGoods(source['got']);
      return gave === null || got === null ? null : { type: 'trade_done', gave, got };
    }
    default:
      return null;
  }
}

export function askFrame(to: string): string {
  return JSON.stringify({ type: 'trade_ask', to });
}

export function answerFrame(accept: boolean): string {
  return JSON.stringify({ type: 'trade_answer', accept });
}

export function offerFrame(items: readonly string[], gold: number): string {
  return JSON.stringify({ type: 'trade_offer', items: items.slice(0, TRADE_LIMITS.items), gold: Math.min(TRADE_LIMITS.gold, Math.max(0, Math.floor(gold))) });
}

export function confirmFrame(revision: number): string {
  return JSON.stringify({ type: 'trade_confirm', revision });
}

export function cancelFrame(): string {
  return JSON.stringify({ type: 'trade_cancel' });
}
