export const SERVICE_KINDS = ['vendor', 'stash', 'auction', 'descent', 'identify'] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];

export interface TradePricing {
  readonly base: number;
  readonly perLevel: number;
  readonly perAffix: number;
  readonly sellRatio: number;
  readonly rarity: Readonly<Record<string, number>>;
}

export interface StockRarity {
  readonly rarity: string;
  readonly weight: number;
}

export interface TradeGood {
  readonly base: string;
  readonly price: number;
}

export interface IdentifyPrice {
  readonly base: number;
  readonly perLevel: number;
}

export interface IdentifyDef {
  readonly prices: Readonly<Record<string, IdentifyPrice>>;
}

export const REMARK_KINDS = ['no_gold', 'good_find'] as const;
export type RemarkKind = (typeof REMARK_KINDS)[number];

export interface TradeDef {
  readonly stashSize: number;
  readonly stockSize: number;
  readonly buybackSize: number;
  readonly reach: number;
  readonly price: TradePricing;
  readonly stockRarities: readonly StockRarity[];
  readonly goods: readonly TradeGood[];
  readonly identify: IdentifyDef;
}
