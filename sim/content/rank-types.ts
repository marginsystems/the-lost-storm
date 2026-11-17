export interface RankChance {
  readonly base: number;
  readonly perLevel: number;
  readonly max: number;
  readonly from: number;
}

export interface RankRun {
  rolled: number;
  ranked: boolean;
}

export interface RankScale {
  readonly life: number;
  readonly damage: number;
  readonly xp: number;
  readonly itemChance: number;
  readonly gold: number;
  readonly items: number;
  readonly floor: string | null;
  readonly mods: number;
  readonly size: number;
}

export interface RankLook {
  readonly rim: number;
  readonly leader: number;
}

export interface PackRankDef {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly aura: string | null;
  readonly look: RankLook | null;
  readonly chance: RankChance | null;
  readonly members: RankScale;
  readonly leader: RankScale | null;
}

export interface RankModChoice {
  readonly mod: string;
  readonly weight: number;
  readonly leader: boolean;
  readonly from: number;
}

export type ModPair = readonly [string, string];

export interface RankNames {
  readonly first: readonly string[];
  readonly second: readonly string[];
}

export interface PackRanks {
  readonly ranks: readonly PackRankDef[];
  readonly pool: readonly RankModChoice[];
  readonly apart: readonly ModPair[];
  readonly stretch: number;
  readonly names: RankNames;
}

export interface MonsterRank {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly aura: string | null;
  readonly leader: boolean;
  readonly title: string | null;
  readonly xp: number;
  readonly items: number;
  readonly floor: string | null;
  readonly size: number;
  readonly look: RankLook | null;
}
