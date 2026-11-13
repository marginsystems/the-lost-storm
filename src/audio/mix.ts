export const MIX = {
  nearDistance: 4,
  farDistance: 30,
  falloffPower: 2,
  audibleGain: 0.02,
  panWidth: 0.85,
} as const;

export interface Placement {
  readonly gain: number;
  readonly pan: number;
}

export const CENTRE: Placement = { gain: 1, pan: 0 };

export function distanceGain(distance: number, reach: number = MIX.farDistance): number {
  if (distance <= MIX.nearDistance) return 1;
  if (distance >= reach) return 0;
  const left: number = 1 - (distance - MIX.nearDistance) / (reach - MIX.nearDistance);
  return left ** MIX.falloffPower;
}

export function panFor(screenOffset: number): number {
  return Math.min(1, Math.max(-1, screenOffset * MIX.panWidth));
}

export function placement(distance: number, screenOffset: number, reach: number = MIX.farDistance): Placement | null {
  const gain: number = distanceGain(distance, reach);
  if (gain < MIX.audibleGain) return null;
  return { gain, pan: panFor(screenOffset) };
}
