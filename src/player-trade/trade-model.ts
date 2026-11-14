import type { TradeClose, TradeFrame, TradeGoods, TradeItem, TradeRefusal, TradeSide } from './trade-protocol.ts';
import { TRADE_LIMITS } from './trade-protocol.ts';

export const TRADE_MODEL = {
  changeLockMs: 1200,
  msPerSecond: 1000,
  noteMs: 4500,
} as const;

export type NoteTone = 'note' | 'done' | 'refusal';

export interface TradeNote {
  readonly text: string;
  readonly tone: NoteTone;
}

export interface Incoming {
  readonly from: string;
  readonly name: string;
  readonly expiresAt: number;
}

export interface OpenTrade {
  readonly with: string;
  readonly name: string;
  readonly revision: number;
  readonly mine: TradeSide;
  readonly theirs: TradeSide;
  readonly countdownEndsAt: number | null;
  readonly changedAt: number | null;
}

export interface TradeState {
  readonly incoming: Incoming | null;
  readonly asking: string | null;
  readonly open: OpenTrade | null;
  readonly note: TradeNote | null;
}

export const NO_TRADE: TradeState = { incoming: null, asking: null, open: null, note: null };

export type TradeCard = { readonly kind: 'none' } | { readonly kind: 'incoming'; readonly incoming: Incoming } | { readonly kind: 'asking'; readonly name: string } | { readonly kind: 'note'; readonly note: TradeNote };

export function tradeCard(state: TradeState, noteAge: number): TradeCard {
  if (state.incoming !== null) return { kind: 'incoming', incoming: state.incoming };
  if (state.open !== null) return { kind: 'none' };
  if (state.asking !== null) return { kind: 'asking', name: state.asking };
  if (state.note !== null && noteAge < TRADE_MODEL.noteMs) return { kind: 'note', note: state.note };
  return { kind: 'none' };
}

export function tradeBusy(state: TradeState): boolean {
  return state.open !== null || state.asking !== null;
}

export function askingText(name: string): string {
  return `Waiting for ${name} to answer.`;
}

const EMPTY_SIDE: TradeSide = { items: [], gold: 0, confirmed: false };

const REFUSAL_TEXT: Readonly<Record<TradeRefusal, string>> = {
  unsupported: 'They cannot trade yet: their game needs to reload.',
  not_here: 'Trading happens in the Hideout.',
  no_such_player: 'That player has left.',
  self: 'You cannot trade with yourself.',
  not_accepting: 'They are not taking trades from you.',
  busy: 'One of you is already trading.',
  too_far: 'Walk closer to trade.',
  slow_down: 'Too fast. Wait a moment.',
  changed: 'The offer changed. Check it again before you confirm.',
  no_trade: 'That trade has ended.',
  no_room: 'Your bags are full. Make room before you confirm.',
  no_character: 'You need a character to trade.',
  too_many: `At most ${String(TRADE_LIMITS.items)} items in one trade.`,
  repeated: 'That item is already in the offer.',
  not_yours: 'That item is no longer yours to trade.',
  story: 'Items the story gives cannot be traded.',
  not_enough_gold: 'You do not have that much gold.',
};

const CLOSE_TEXT: Readonly<Record<TradeClose, string>> = {
  cancelled: 'The trade was cancelled.',
  declined: 'They declined the trade.',
  expired: 'The trade request expired.',
  walked_away: 'You walked too far apart. The trade was cancelled.',
  left: 'They left. The trade was cancelled.',
  disconnected: 'The connection dropped. The trade was cancelled.',
  failed: 'The trade could not finish. Nothing changed hands.',
};

export function refusalText(reason: TradeRefusal): string {
  return REFUSAL_TEXT[reason];
}

export function closeText(reason: TradeClose): string {
  return CLOSE_TEXT[reason];
}

function sameGoods(a: TradeGoods, b: TradeGoods): boolean {
  return a.gold === b.gold && a.items.length === b.items.length && a.items.every((item: TradeItem, index: number): boolean => item.id === b.items[index]?.id);
}

function goodsLine(goods: TradeGoods): string {
  const parts: string[] = [];
  if (goods.items.length > 0) parts.push(goods.items.length === 1 ? '1 item' : `${String(goods.items.length)} items`);
  if (goods.gold > 0) parts.push(`${String(goods.gold)} gold`);
  return parts.length === 0 ? 'nothing' : parts.join(' and ');
}

export function doneText(gave: TradeGoods, got: TradeGoods): string {
  return `Trade done. You gave ${goodsLine(gave)} and got ${goodsLine(got)}.`;
}

function withSides(state: TradeState, frame: Extract<TradeFrame, { type: 'trade_state' }>, now: number): TradeState {
  if (state.open === null) return state;
  const changed: boolean = !sameGoods(state.open.theirs, frame.theirs);
  return {
    ...state,
    open: { ...state.open, revision: frame.revision, mine: frame.mine, theirs: frame.theirs, countdownEndsAt: frame.countdownEndsAt, changedAt: changed ? now : state.open.changedAt },
    note: changed ? { text: `${state.open.name} changed their offer. Check it before you confirm.`, tone: 'note' } : state.note,
  };
}

export function tradeStep(state: TradeState, frame: TradeFrame, now: number): TradeState {
  switch (frame.type) {
    case 'trade_asked':
      return { ...state, incoming: { from: frame.from, name: frame.name, expiresAt: frame.expiresAt } };
    case 'trade_open':
      return { incoming: null, asking: null, note: null, open: { with: frame.with, name: frame.name, revision: 0, mine: EMPTY_SIDE, theirs: EMPTY_SIDE, countdownEndsAt: null, changedAt: null } };
    case 'trade_state':
      return withSides(state, frame, now);
    case 'trade_refused':
      return { ...state, asking: state.open === null ? null : state.asking, note: { text: refusalText(frame.reason), tone: 'refusal' } };
    case 'trade_closed':
      return { incoming: null, asking: null, open: null, note: { text: closeText(frame.reason), tone: 'refusal' } };
    case 'trade_done':
      return { incoming: null, asking: null, open: null, note: { text: doneText(frame.gave, frame.got), tone: 'done' } };
  }
  return state;
}

export function asked(state: TradeState, name: string): TradeState {
  return { ...state, asking: name, note: { text: `Asked ${name} to trade.`, tone: 'note' } };
}

export function expire(state: TradeState, now: number): TradeState {
  if (state.incoming === null || state.incoming.expiresAt > now) return state;
  return { ...state, incoming: null };
}

export function gone(state: TradeState): TradeState {
  if (state.open === null && state.incoming === null && state.asking === null) return state;
  return { incoming: null, asking: null, open: null, note: state.open === null ? null : { text: closeText('disconnected'), tone: 'refusal' } };
}

export function parseGold(text: string): number | null {
  const trimmed: string = text.trim();
  if (trimmed === '') return 0;
  if (!/^\d+$/.test(trimmed)) return null;
  const gold: number = Number(trimmed);
  return gold <= TRADE_LIMITS.gold ? gold : null;
}

export type ConfirmBlock = 'none' | 'confirmed' | 'changed' | 'no_room' | 'empty';

export function confirmBlock(open: OpenTrade, freeSlots: number, now: number): ConfirmBlock {
  if (open.mine.confirmed) return 'confirmed';
  if (open.changedAt !== null && now - open.changedAt < TRADE_MODEL.changeLockMs) return 'changed';
  if (open.mine.items.length === 0 && open.mine.gold === 0 && open.theirs.items.length === 0 && open.theirs.gold === 0) return 'empty';
  if (freeSlots + open.mine.items.length < open.theirs.items.length) return 'no_room';
  return 'none';
}

function roomText(short: number): string {
  return `Your bags are full: make room for ${short === 1 ? '1 more item' : `${String(short)} more items`}.`;
}

export function blockText(block: ConfirmBlock, open: OpenTrade, freeSlots: number): string | null {
  switch (block) {
    case 'none':
      return null;
    case 'confirmed':
      return open.theirs.confirmed ? 'Both confirmed.' : `Waiting for ${open.name} to confirm.`;
    case 'changed':
      return 'The offer just changed.';
    case 'empty':
      return 'Add items or gold to trade.';
    case 'no_room':
      return roomText(open.theirs.items.length - open.mine.items.length - freeSlots);
  }  return null;
}

export function secondsLeft(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / TRADE_MODEL.msPerSecond));
}
