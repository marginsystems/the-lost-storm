export const BARRIER_SIDES = ['north', 'south', 'east', 'west'] as const;
export type BarrierSide = (typeof BARRIER_SIDES)[number];

export interface BarrierFace {
  readonly props: readonly string[];
  readonly out: number;
  readonly step: number;
  readonly turn: number;
}

export interface BarrierRow {
  readonly far: BarrierFace;
  readonly near: BarrierFace;
  readonly collide: boolean;
  readonly shadow: boolean;
}

export interface ZoneBarrier {
  readonly nearSides: readonly BarrierSide[];
  readonly exitClear: number;
  readonly rows: readonly BarrierRow[];
}
