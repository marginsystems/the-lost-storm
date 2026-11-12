export const FLICKER = {
  gapMin: 4,
  gapSpread: 6,
  firstFor: 0.09,
  dipFor: 0.08,
  secondFor: 0.1,
  floor: 0.35,
  boltTop: 8,
  boltStep: 7,
  boltStepSpread: 5,
  boltSway: 6,
} as const;

export type FlashPhase = 'quiet' | 'first' | 'dip' | 'second';

export interface FlickerState {
  readonly wait: number;
  readonly since: number | null;
}

export interface FlickerFrame {
  readonly state: FlickerState;
  readonly phase: FlashPhase;
  readonly fresh: boolean;
}

export interface BoltPoint {
  readonly x: number;
  readonly y: number;
}

export function flashLength(): number {
  return FLICKER.firstFor + FLICKER.dipFor + FLICKER.secondFor;
}

export function nextGap(random: () => number): number {
  return FLICKER.gapMin + random() * FLICKER.gapSpread;
}

export function startFlicker(random: () => number): FlickerState {
  return { wait: nextGap(random), since: null };
}

export function phaseAt(seconds: number): FlashPhase {
  if (seconds < 0) return 'quiet';
  if (seconds < FLICKER.firstFor) return 'first';
  if (seconds < FLICKER.firstFor + FLICKER.dipFor) return 'dip';
  if (seconds < flashLength()) return 'second';
  return 'quiet';
}

export function manaStrength(fraction: number): number {
  if (fraction <= 0) return 0;
  return FLICKER.floor + (1 - FLICKER.floor) * Math.min(1, fraction);
}

export function stepFlicker(state: FlickerState, dt: number, fraction: number, random: () => number): FlickerFrame {
  if (state.since !== null) {
    const since: number = state.since + dt;
    if (since >= flashLength() || fraction <= 0) return { state: { wait: nextGap(random), since: null }, phase: 'quiet', fresh: false };
    return { state: { wait: 0, since }, phase: phaseAt(since), fresh: false };
  }
  const wait: number = state.wait - dt;
  if (wait > 0) return { state: { wait, since: null }, phase: 'quiet', fresh: false };
  if (fraction <= 0) return { state: { wait: nextGap(random), since: null }, phase: 'quiet', fresh: false };
  return { state: { wait: 0, since: 0 }, phase: 'first', fresh: true };
}

export function boltPoints(random: () => number, width: number, height: number): BoltPoint[] {
  const points: BoltPoint[] = [];
  const centre: number = width * (0.35 + random() * 0.3);
  for (let y: number = FLICKER.boltTop; y < height; y += FLICKER.boltStep + random() * FLICKER.boltStepSpread) {
    points.push({ x: centre + (random() * 2 - 1) * FLICKER.boltSway, y });
  }
  return points;
}
