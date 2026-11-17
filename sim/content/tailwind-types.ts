export interface TailwindTier {
  readonly id: string;
  readonly name: string;
  readonly at: number;
  readonly fuse: number;
  readonly xp: number;
  readonly loot: number;
  readonly speed: number;
  readonly windfallXp: number;
  readonly windfallGold: number;
}

export interface TailwindWeights {
  readonly plain: number;
  readonly ranks: Readonly<Record<string, number>>;
  readonly leader: number;
  readonly boss: number;
}

export interface TailwindBurst {
  readonly window: number;
  readonly seconds: number;
  readonly most: number;
}

export interface TailwindDrain {
  readonly drain: number;
  readonly reach: number;
}

export interface TailwindDef {
  readonly name: string;
  readonly fuse: number;
  readonly weights: TailwindWeights;
  readonly burst: TailwindBurst;
  readonly idle: TailwindDrain;
  readonly fight: TailwindDrain;
  readonly tiers: readonly TailwindTier[];
}
