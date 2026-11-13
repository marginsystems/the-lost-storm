export const GAIT = {
  minSpeed: 0.15,
  switchMargin: 0.25,
  hurryCost: 1.5,
} as const;

export interface GaitSpeed {
  readonly groundSpeed: number;
}

export interface GaitChoice {
  readonly index: number;
  readonly rate: number;
}

function misfit(gait: GaitSpeed, scale: number, speed: number): number {
  const stretch: number = Math.log(speed / (gait.groundSpeed * scale));
  return stretch > 0 ? stretch * GAIT.hurryCost : -stretch;
}

export function chooseGait(gaits: readonly GaitSpeed[], scale: number, speed: number, current: number): GaitChoice | null {
  if (speed < GAIT.minSpeed || gaits.length === 0) return null;
  let best: number = 0;
  gaits.forEach((gait: GaitSpeed, index: number): void => {
    const leader: GaitSpeed | undefined = gaits[best];
    if (leader !== undefined && misfit(gait, scale, speed) < misfit(leader, scale, speed)) best = index;
  });
  const held: GaitSpeed | undefined = gaits[current];
  const bestGait: GaitSpeed | undefined = gaits[best];
  const index: number = held !== undefined && bestGait !== undefined && misfit(held, scale, speed) - misfit(bestGait, scale, speed) < GAIT.switchMargin ? current : best;
  const chosen: GaitSpeed | undefined = gaits[index];
  return chosen === undefined ? null : { index, rate: speed / (chosen.groundSpeed * scale) };
}
