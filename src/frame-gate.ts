export const FRAME_GATE = {
  queuedUnderVeil: 2,
} as const;

export interface FrameState {
  readonly playing: boolean;
  readonly blocking: boolean;
  readonly lost: boolean;
  readonly menuOpen: boolean;
  readonly presenting: boolean;
  readonly gpuQueued: number;
}

export interface FrameGate {
  readonly collect: boolean;
  readonly queue: boolean;
  readonly step: boolean;
  readonly draw: boolean;
}

export function frameGate(state: FrameState): FrameGate {
  const step: boolean = state.playing && !state.blocking && !state.lost;
  const fed: boolean = !state.blocking || state.gpuQueued < FRAME_GATE.queuedUnderVeil;
  return { collect: state.playing && (state.blocking || !state.lost), queue: step && !state.menuOpen, step, draw: state.playing && state.presenting && fed };
}
