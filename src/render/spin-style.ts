export type SpinStyleId = 'now' | 'upright' | 'heavy' | 'stepping' | 'mocap' | 'skate' | 'twohand' | 'low';

export type SpinPivot = 'hips' | 'foot_l' | 'foot_r';

export interface SpinClips {
  readonly start: string;
  readonly loop: string;
  readonly end: string;
  readonly pivot: SpinPivot;
}

export interface SpinTrail {
  readonly fill: number;
  readonly arcBand: number;
  readonly width: number;
  readonly band: number;
  readonly length: number;
  readonly lag: number;
  readonly strength: number;
}

export interface SpinStyle {
  readonly id: SpinStyleId;
  readonly cycles: number;
  readonly pace: number;
  readonly paceFull: number;
  readonly lean: number;
  readonly leanStill: number;
  readonly beat: number;
  readonly trail: SpinTrail;
  readonly clips: SpinClips | null;
}

export const SPIN_STYLE = {
  param: 'spin',
  shipped: 'twohand',
  order: ['now', 'upright', 'heavy', 'stepping', 'mocap', 'skate', 'twohand', 'low'],
} as const satisfies { readonly param: string; readonly shipped: SpinStyleId; readonly order: readonly SpinStyleId[] };

const THIN_TRAIL: SpinTrail = { fill: 0.02, arcBand: 0.22, width: 0.025, band: 0.12, length: 0.98, lag: 0.35, strength: 0.45 };

export const SPIN_STYLES: Readonly<Record<SpinStyleId, SpinStyle>> = {
  now: { id: 'now', cycles: 0, pace: 1, paceFull: 1, lean: 0, leanStill: 0, beat: 0, trail: { fill: 0.08, arcBand: 0.5, width: 0.06, band: 0.25, length: 0.9, lag: 0.6, strength: 0.55 }, clips: null },
  upright: { id: 'upright', cycles: 0, pace: 1.5, paceFull: 1.5, lean: 0, leanStill: 0, beat: 0, trail: { fill: 0.02, arcBand: 0.22, width: 0.025, band: 0.12, length: 0.98, lag: 0.35, strength: 0.45 }, clips: null },
  heavy: { id: 'heavy', cycles: 0, pace: 0.45, paceFull: 1, lean: 0.32, leanStill: 0.14, beat: 0, trail: { fill: 0.14, arcBand: 0.8, width: 0.12, band: 0.6, length: 0.82, lag: 0.85, strength: 0.75 }, clips: null },
  stepping: { id: 'stepping', cycles: 1, pace: 0.7, paceFull: 0.85, lean: 0.08, leanStill: 0, beat: 0.8, trail: { fill: 0.05, arcBand: 0.4, width: 0.05, band: 0.3, length: 0.92, lag: 0.5, strength: 0.5 }, clips: null },
  mocap: { id: 'mocap', cycles: 0, pace: 1, paceFull: 1, lean: 0, leanStill: 0, beat: 0, trail: THIN_TRAIL, clips: { start: 'spin_mocap_in', loop: 'spin_mocap_loop', end: 'spin_mocap_out', pivot: 'hips' } },
  skate: { id: 'skate', cycles: 0, pace: 1, paceFull: 1, lean: 0, leanStill: 0, beat: 0, trail: THIN_TRAIL, clips: { start: 'spin_skate_in', loop: 'spin_skate_loop', end: 'spin_skate_out', pivot: 'foot_l' } },
  twohand: { id: 'twohand', cycles: 0, pace: 1, paceFull: 1, lean: 0, leanStill: 0, beat: 0, trail: THIN_TRAIL, clips: { start: 'spin_twohand_in', loop: 'spin_twohand_loop', end: 'spin_twohand_out', pivot: 'foot_l' } },
  low: { id: 'low', cycles: 0, pace: 1, paceFull: 1, lean: 0, leanStill: 0, beat: 0, trail: THIN_TRAIL, clips: { start: 'spin_low_in', loop: 'spin_low_loop', end: 'spin_low_out', pivot: 'foot_l' } },
};

const FULL_TURN: number = Math.PI * 2;

function isStyle(value: string): value is SpinStyleId {
  return SPIN_STYLE.order.some((id: SpinStyleId): boolean => id === value);
}

export function spinStyleFrom(search: string): SpinStyle {
  const asked: string = (new URLSearchParams(search).get(SPIN_STYLE.param) ?? '').trim();
  if (asked !== '') {
    const index: number = Number(asked);
    const numbered: SpinStyleId | undefined = Number.isInteger(index) ? SPIN_STYLE.order[index] : undefined;
    if (numbered !== undefined) return SPIN_STYLES[numbered];
    if (isStyle(asked)) return SPIN_STYLES[asked];
  }
  return SPIN_STYLES[SPIN_STYLE.shipped];
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function lapDelta(from: number, to: number): number {
  const step: number = (((to - from) % FULL_TURN) + FULL_TURN) % FULL_TURN;
  return step > Math.PI ? step - FULL_TURN : step;
}

export function turnStep(style: SpinStyle, delta: number, share: number): number {
  const weight: number = Math.min(1, Math.max(0, share));
  return delta * (style.pace + (style.paceFull - style.pace) * weight);
}

export function shownTurn(style: SpinStyle, turned: number): number {
  if (style.beat <= 0) return turned;
  const laps: number = Math.floor(turned / FULL_TURN);
  const part: number = turned / FULL_TURN - laps;
  return (laps + part * (1 - style.beat) + smooth(part) * style.beat) * FULL_TURN;
}

export function spinCycle(style: SpinStyle, turned: number): number | null {
  if (style.cycles <= 0) return null;
  const cycle: number = (turned / FULL_TURN) * style.cycles;
  return cycle - Math.floor(cycle);
}

export function spinLean(style: SpinStyle, share: number, gliding: boolean): number {
  const weight: number = Math.min(1, Math.max(0, share));
  return gliding ? style.lean * (0.5 + 0.5 * weight) : style.leanStill * weight;
}
