export const RUN_PICKS = ['none', 'monster', 'family'] as const;
export type RunPick = (typeof RUN_PICKS)[number];

export interface RunRise {
  readonly monster: string;
  readonly chance: number;
}

export interface RunShape {
  readonly rankChance: number;
  readonly grow: number;
  readonly mods: readonly string[];
  readonly life: number;
  readonly damage: number;
  readonly fill: boolean;
  readonly lean: number;
  readonly rise: RunRise | null;
}

export interface RunReward {
  readonly xp: number;
  readonly gold: number;
  readonly items: number;
  readonly rarity: number;
}

export interface RunCondition {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  readonly price: number;
  readonly danger: number;
  readonly pick: RunPick;
  readonly shape: RunShape;
  readonly reward: RunReward;
  readonly excludes: readonly string[];
}

export interface RunFamily {
  readonly id: string;
  readonly name: string;
  readonly monsters: readonly string[];
}

export interface RunPricing {
  readonly share: number;
  readonly steps: readonly number[];
  readonly round: number;
  readonly least: number;
}

export interface RunTableDef {
  readonly levels: readonly string[];
  readonly pins: number;
  readonly pricing: RunPricing;
  readonly conditions: readonly RunCondition[];
  readonly families: readonly RunFamily[];
  readonly familyLeast: number;
}
