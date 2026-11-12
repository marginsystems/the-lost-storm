import type { Motion } from '../../sim/world/types.ts';

export const LOCOMOTION = {
  minSpeed: 0.15,
  switchMargin: 0.25,
  hurryCost: 1.5,
  flinchTime: 0.12,
  staggerReel: 0.32,
  minStaggerRate: 0.5,
  maxStaggerRate: 2.2,
} as const;

export type ClipKind = 'idle' | 'gait' | 'stagger' | 'action' | 'rise';

export function clipKindOf(motion: Motion): ClipKind {
  switch (motion) {
    case 'still':
      return 'idle';
    case 'stride':
      return 'gait';
    case 'knocked':
    case 'pulled':
      return 'stagger';
    case 'dash':
    case 'lunge':
      return 'action';
    case 'rising':
      return 'rise';
  }
  return 'idle';
}

export interface GaitSpeed {
  readonly groundSpeed: number;
}

export interface GaitChoice {
  readonly index: number;
  readonly rate: number;
}

function misfit(gait: GaitSpeed, scale: number, speed: number): number {
  const stretch: number = Math.log(speed / (gait.groundSpeed * scale));
  return stretch > 0 ? stretch * LOCOMOTION.hurryCost : -stretch;
}

export function chooseGait(gaits: readonly GaitSpeed[], scale: number, speed: number, current: number): GaitChoice | null {
  if (speed < LOCOMOTION.minSpeed || gaits.length === 0) return null;
  let best: number = 0;
  gaits.forEach((gait: GaitSpeed, index: number): void => {
    const leader: GaitSpeed | undefined = gaits[best];
    if (leader !== undefined && misfit(gait, scale, speed) < misfit(leader, scale, speed)) best = index;
  });
  const held: GaitSpeed | undefined = gaits[current];
  const bestGait: GaitSpeed | undefined = gaits[best];
  const index: number = held !== undefined && bestGait !== undefined && misfit(held, scale, speed) - misfit(bestGait, scale, speed) < LOCOMOTION.switchMargin ? current : best;
  const chosen: GaitSpeed | undefined = gaits[index];
  return chosen === undefined ? null : { index, rate: speed / (chosen.groundSpeed * scale) };
}

export function staggerRate(knockTime: number): number {
  if (knockTime <= 0) return 1;
  return Math.min(LOCOMOTION.maxStaggerRate, Math.max(LOCOMOTION.minStaggerRate, LOCOMOTION.staggerReel / knockTime));
}

export function flinches(knockTime: number): boolean {
  return knockTime < LOCOMOTION.flinchTime;
}
