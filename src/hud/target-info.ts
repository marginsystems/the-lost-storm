export const TARGET_INFO = {
  infoDelay: 0.35,
  fadeOut: 0.3,
} as const;

export interface InfoState {
  readonly id: number | null;
  readonly dwell: number;
  readonly informed: boolean;
  readonly quiet: number;
  readonly key: string;
  readonly kind: string;
}

export interface InfoTarget {
  readonly id: number;
  readonly kind: string;
  readonly key: string;
  readonly hasLines: boolean;
}

export interface InfoStep {
  readonly state: InfoState;
  readonly refill: boolean;
  readonly retarget: boolean;
}

export const NO_INFO: InfoState = { id: null, dwell: 0, informed: false, quiet: TARGET_INFO.fadeOut, key: '', kind: '' };

function shown(state: InfoState, informed: boolean): InfoState {
  if (informed === state.informed) return state;
  return { ...state, informed, quiet: informed ? state.quiet : 0 };
}

export function stepInfo(before: InfoState, target: InfoTarget | null, dt: number): InfoStep {
  const resting: InfoState = before.informed ? before : { ...before, quiet: before.quiet + dt };
  if (target === null) return { state: shown({ ...resting, dwell: 0 }, false), refill: false, retarget: false };
  const retarget: boolean = target.id !== resting.id;
  const same: boolean = resting.informed && target.kind === resting.kind;
  const picked: InfoState = retarget ? shown({ ...resting, id: target.id, kind: target.kind, dwell: same ? resting.dwell : 0 }, same) : resting;
  const dwelt: InfoState = { ...picked, dwell: picked.dwell + dt };
  const settled: boolean = dwelt.informed || dwelt.quiet >= TARGET_INFO.fadeOut;
  const refill: boolean = target.key !== dwelt.key && settled;
  const filled: InfoState = refill ? { ...dwelt, key: target.key } : dwelt;
  return { state: shown(filled, target.hasLines && target.key === filled.key && (same || filled.dwell >= TARGET_INFO.infoDelay)), refill, retarget };
}
