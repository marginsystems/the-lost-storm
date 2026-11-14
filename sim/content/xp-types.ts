export interface XpGap {
  readonly band: number;
  readonly widenEvery: number;
  readonly soft: number;
  readonly power: number;
  readonly floor: number;
  readonly above: boolean;
}

export interface XpCurve {
  readonly base: number;
  readonly growth: number;
  readonly maxLevel: number;
  readonly gap: XpGap;
}

export interface XpReduction {
  readonly side: 'below' | 'above';
  readonly share: number;
}
