import type { MonsterState } from './types.ts';

export const TARGETING = {
  grace: 1.6,
  fallen: 0.4,
} as const;

export type TargetKind = 'boss' | 'monster';

export interface Target {
  readonly monster: MonsterState;
  readonly kind: TargetKind;
}

export interface RecentHit {
  readonly id: number;
  readonly age: number;
}

export interface Candidate {
  readonly id: number;
  readonly alive: boolean;
  readonly aggro: boolean;
  readonly def: { readonly boss: unknown };
}

export function pickTarget<T extends Candidate>(monsters: readonly T[], hoveredId: number | null, recent: RecentHit | null, grace: number): { readonly monster: T; readonly kind: TargetKind } | null {
  const boss: T | undefined = monsters.find((monster: T): boolean => monster.def.boss !== null && monster.alive && monster.aggro);
  if (boss !== undefined) return { monster: boss, kind: 'boss' };
  const hovered: T | undefined = monsters.find((monster: T): boolean => monster.id === hoveredId && monster.alive);
  if (hovered !== undefined) return { monster: hovered, kind: 'monster' };
  if (recent === null || recent.age > grace) return null;
  const struck: T | undefined = monsters.find((monster: T): boolean => monster.id === recent.id);
  if (struck === undefined) return null;
  if (!struck.alive && recent.age > Math.min(grace, TARGETING.fallen)) return null;
  return { monster: struck, kind: 'monster' };
}
