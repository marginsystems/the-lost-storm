import { ITEM_SLOTS } from '../../sim/content/types.ts';
import type { LedgerItem } from '../../sim/world/ledger.ts';
import type { ListRefusal } from '../../sim/world/purse.ts';
import type { ItemInstance } from '../../sim/world/types.ts';
import type { AuctionFilters, AuctionRefusal, AuctionRules, AuctionSort, Sale } from '../backend/auction-api.ts';

export type AuctionTab = 'browse' | 'sell' | 'mine';

export const AUCTION_TABS: readonly AuctionTab[] = ['browse', 'sell', 'mine'];

export const TAB_NAMES: Readonly<Record<AuctionTab, string>> = { browse: 'Browse', sell: 'Sell', mine: 'Mine' };

export type LineTone = 'note' | 'done' | 'refusal';

export interface AuctionLine {
  readonly text: string;
  readonly tone: LineTone;
}

export type ChoiceField = 'slot' | 'rarity' | 'sort';

export const SORTS: readonly AuctionSort[] = ['price', 'newest'];

export function choiceFilter(field: ChoiceField, value: string): Partial<AuctionFilters> {
  if (field === 'slot') return { slot: ITEM_SLOTS.find((each: string): boolean => each === value) ?? null };
  if (field === 'rarity') return { rarity: value === '' ? null : value };
  return { sort: SORTS.find((each: AuctionSort): boolean => each === value) ?? 'price' };
}

export const FIRST_PAGE: AuctionFilters = { slot: null, rarity: null, minLevel: null, maxLevel: null, maxPrice: null, sort: 'price', page: 1 };

const MS_PER_MINUTE: number = 60_000;
const MINUTES_PER_HOUR: number = 60;
const PERCENT: number = 100;

const REFUSAL_LINES: Readonly<Record<AuctionRefusal, string>> = {
  bad_request: 'The auctioneer did not follow that.',
  bad_price: 'That price is not allowed.',
  no_such_listing: 'That listing does not exist.',
  listing_gone: 'That listing is gone.',
  price_changed: 'The price changed. Look again.',
  own_listing: 'That is your own listing.',
  not_enough_gold: 'Not enough gold.',
  not_listable: 'That item cannot be listed.',
  no_character: 'The house needs a saved character.',
  too_many_listings: 'You have as many listings open as the house allows.',
  level_too_low: 'You are too new here to sell.',
  rate_limited: 'Too quick. Wait a moment.',
  unauthorized: 'Your session ended. Reload to go on.',
};

const PICK_LINES: Readonly<Record<ListRefusal, string>> = {
  empty: 'Pick an item from your bags or stash.',
  unverified: 'This item is not verified yet, so it cannot be sold.',
  story: 'This cannot be sold.',
};

export const AUCTION_LINES: {
  readonly closed: AuctionLine;
  readonly failed: AuctionLine;
  readonly noRoom: AuctionLine;
  readonly listed: AuctionLine;
  readonly bought: AuctionLine;
  readonly cancelled: AuctionLine;
  readonly nothing: AuctionLine;
  readonly pick: AuctionLine;
} = {
  closed: { text: 'The auction house is closed.', tone: 'refusal' },
  failed: { text: 'The auctioneer did not answer. Nothing changed.', tone: 'refusal' },
  noRoom: { text: 'Make room in your bags or stash first.', tone: 'refusal' },
  listed: { text: 'Listed.', tone: 'done' },
  bought: { text: 'Bought.', tone: 'done' },
  cancelled: { text: 'The item is back with you.', tone: 'done' },
  nothing: { text: 'Nothing is waiting.', tone: 'note' },
  pick: { text: PICK_LINES.empty, tone: 'note' },
};

export function refusalLine(code: AuctionRefusal, rules: AuctionRules | null): AuctionLine {
  if (code === 'level_too_low' && rules !== null && rules.sellLevel > 0) return { text: `Selling needs level ${rules.sellLevel}.`, tone: 'refusal' };
  if (code === 'too_many_listings' && rules !== null) return { text: `At most ${rules.maxListings} listings can be open.`, tone: 'refusal' };
  return { text: REFUSAL_LINES[code], tone: 'refusal' };
}

export function pickLine(reason: ListRefusal): AuctionLine {
  return { text: PICK_LINES[reason], tone: reason === 'empty' ? 'note' : 'refusal' };
}

export function priceLine(rules: AuctionRules | null): AuctionLine {
  return rules === null ? { text: 'Set a price in whole gold.', tone: 'refusal' } : { text: `Set a price from ${rules.minPrice} to ${rules.maxPrice} gold.`, tone: 'refusal' };
}

export function collectedLine(gold: number, items: number): AuctionLine {
  const parts: string[] = [];
  if (gold > 0) parts.push(`${gold} gold`);
  if (items > 0) parts.push(items === 1 ? '1 item' : `${items} items`);
  return parts.length === 0 ? AUCTION_LINES.nothing : { text: `Collected ${parts.join(' and ')}.`, tone: 'done' };
}

export function parsePrice(text: string, rules: AuctionRules | null): number | null {
  const trimmed: string = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const price: number = Number(trimmed);
  if (!Number.isSafeInteger(price) || price < 1) return null;
  if (rules !== null && (price < rules.minPrice || price > rules.maxPrice)) return null;
  return price;
}

export function parseLevel(text: string): number | null {
  const trimmed: string = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const level: number = Number(trimmed);
  return Number.isSafeInteger(level) && level >= 1 ? level : null;
}

export function timeLeft(endsAt: string, now: number): string {
  const minutes: number = Math.max(0, Math.ceil((Date.parse(endsAt) - now) / MS_PER_MINUTE));
  if (minutes <= 0) return 'Ending';
  if (minutes < MINUTES_PER_HOUR) return `${minutes}m left`;
  const hours: number = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest: number = minutes % MINUTES_PER_HOUR;
  return rest === 0 ? `${hours}h left` : `${hours}h ${rest}m left`;
}

export function termsLine(rules: AuctionRules): string {
  const cut: number = Math.round(rules.cut * PERCENT);
  const hours: string = `Listings last ${rules.lifeHours} hours.`;
  return cut > 0 ? `The house keeps ${cut}% of a sale. ${hours}` : hours;
}

export function proceeds(price: number, rules: AuctionRules | null): number {
  return rules === null ? price : price - Math.floor(price * rules.cut);
}

export function saleLine(sale: Sale): string {
  if (sale.outcome === 'cancelled') return 'Cancelled';
  if (sale.outcome === 'expired') return sale.collected ? 'Expired · back with you' : 'Expired · waiting';
  return sale.collected ? `Sold for ${sale.price} · you got ${sale.proceeds}` : `Sold for ${sale.price} · ${sale.proceeds} waiting`;
}

export interface ShownItems {
  shown(item: LedgerItem): ItemInstance;
}

export function createShownItems(): ShownItems {
  const uids: Map<string, number> = new Map<string, number>();
  return {
    shown(item: LedgerItem): ItemInstance {
      const known: number | undefined = uids.get(item.id);
      const uid: number = known ?? -(uids.size + 1);
      if (known === undefined) uids.set(item.id, uid);
      return { uid, base: item.base, rarity: item.rarity, level: item.level, affixes: item.affixes, ledger: item.id };
    },
  };
}
