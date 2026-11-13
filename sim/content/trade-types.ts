export const SERVICE_KINDS = ['vendor', 'stash', 'auction'] as const;
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

export interface TradeDef {
  readonly stashSize: number;
  readonly stockSize: number;
  readonly buybackSize: number;
  readonly reach: number;
  readonly price: TradePricing;
  readonly stockRarities: readonly StockRarity[];
}
