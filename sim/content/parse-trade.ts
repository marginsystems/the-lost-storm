import type { Fields } from './read.ts';
import { choice, ContentError, each, fields, fraction, isFields, nonNegative, numeric, positive, text } from './read.ts';
import type { IdentifyDef, IdentifyPrice, RemarkKind, ServiceKind, StockRarity, TradeDef, TradeGood, TradePricing } from './trade-types.ts';
import { REMARK_KINDS, SERVICE_KINDS } from './trade-types.ts';
import type { Content, ItemBaseDef } from './types.ts';

export function service(source: Fields, where: string): ServiceKind | null {
  const value: unknown = source['service'];
  if (value === undefined || value === null) return null;
  return choice(source, 'service', SERVICE_KINDS, where);
}

export function remarks(source: Fields, where: string): Readonly<Partial<Record<RemarkKind, string>>> {
  const value: unknown = source['remarks'];
  if (value === undefined) return {};
  const said: Fields = fields(value, `${where}.remarks`);
  const kept: Partial<Record<RemarkKind, string>> = {};
  for (const key of Object.keys(said)) {
    const kind: RemarkKind | undefined = REMARK_KINDS.find((candidate: RemarkKind): boolean => candidate === key);
    if (kind === undefined) throw new ContentError(`${where}.remarks.${key}`, `expected one of ${REMARK_KINDS.join(', ')}`);
    kept[kind] = text(said, key, `${where}.remarks`);
  }
  return kept;
}

function count(source: Fields, key: string, where: string): number {
  const value: number = positive(source, key, where);
  if (!Number.isInteger(value)) throw new ContentError(where, `${key} must be a whole number`);
  return value;
}

function rarityPrices(value: unknown, where: string): Record<string, number> {
  if (!isFields(value)) throw new ContentError(where, 'must be an object of rarity prices');
  const prices: Record<string, number> = {};
  for (const key of Object.keys(value)) prices[key] = positive(value, key, where);
  return prices;
}

function pricing(value: unknown, where: string): TradePricing {
  const source: Fields = fields(value, where);
  return {
    base: positive(source, 'base', where),
    perLevel: numeric(source, 'perLevel', where),
    perAffix: numeric(source, 'perAffix', where),
    sellRatio: fraction(source, 'sellRatio', where),
    rarity: rarityPrices(source['rarity'], `${where}.rarity`),
  };
}

function identifyPrice(value: unknown, where: string): IdentifyPrice {
  const source: Fields = fields(value, where);
  return { base: positive(source, 'base', where), perLevel: nonNegative(source, 'perLevel', where) };
}

function identify(value: unknown, where: string): IdentifyDef {
  if (value === undefined) return { prices: {} };
  const source: Fields = fields(value, where);
  const listed: Fields = fields(source['prices'], `${where}.prices`);
  const prices: Record<string, IdentifyPrice> = {};
  for (const key of Object.keys(listed)) prices[key] = identifyPrice(listed[key], `${where}.prices.${key}`);
  return { prices };
}

function stockRarity(value: unknown, where: string): StockRarity {
  const source: Fields = fields(value, where);
  return { rarity: text(source, 'rarity', where), weight: positive(source, 'weight', where) };
}

function good(value: unknown, where: string): TradeGood {
  const source: Fields = fields(value, where);
  return { base: text(source, 'base', where), price: count(source, 'price', where) };
}

export function trade(value: unknown, where: string): TradeDef {
  const source: Fields = fields(value, where);
  return {
    stashSize: count(source, 'stashSize', where),
    stockSize: count(source, 'stockSize', where),
    buybackSize: count(source, 'buybackSize', where),
    reach: positive(source, 'reach', where),
    price: pricing(source['price'], `${where}.price`),
    stockRarities: each(source['stockRarities'], `${where}.stockRarities`, stockRarity),
    goods: source['goods'] === undefined ? [] : each(source['goods'], `${where}.goods`, good),
    identify: identify(source['identify'], `${where}.identify`),
  };
}

export function tradeProblems(content: Content): string[] {
  const problems: string[] = [];
  const rarities: Set<string> = new Set<string>(content.rarities.map((rarity): string => rarity.id));
  for (const rarity of rarities) if (content.trade.price.rarity[rarity] === undefined) problems.push(`trade has no price for rarity ${rarity}`);
  for (const key of Object.keys(content.trade.price.rarity)) if (!rarities.has(key)) problems.push(`trade prices unknown rarity ${key}`);
  for (const entry of content.trade.stockRarities) if (!rarities.has(entry.rarity)) problems.push(`trade stocks unknown rarity ${entry.rarity}`);
  if (content.trade.stockRarities.length === 0) problems.push('trade needs at least one stock rarity');
  for (const entry of content.trade.goods) {
    const base: ItemBaseDef | undefined = content.itemBases.get(entry.base);
    if (base === undefined) problems.push(`trade sells unknown item ${entry.base}`);
    else if (base.dropWeight > 0) problems.push(`trade good ${entry.base} must not drop`);
    else if (!base.unsellable) problems.push(`trade good ${entry.base} must be unsellable`);
  }
  for (const key of Object.keys(content.trade.identify.prices)) if (!rarities.has(key)) problems.push(`trade identifies unknown rarity ${key}`);
  if (new Set<string>(content.trade.goods.map((entry: TradeGood): string => entry.base)).size !== content.trade.goods.length) problems.push('trade lists a good twice');
  return problems;
}
