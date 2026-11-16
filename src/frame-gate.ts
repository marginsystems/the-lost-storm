export interface FrameState {
  readonly playing: boolean;
  readonly blocking: boolean;
  readonly lost: boolean;
  readonly menuOpen: boolean;
  readonly presenting: boolean;
}

export interface FrameGate {
  readonly collect: boolean;
  readonly queue: boolean;
  readonly step: boolean;
  readonly draw: boolean;
}

export function frameGate(state: FrameState): FrameGate {
  const step: boolean = state.playing && !state.blocking && !state.lost;
  return { collect: state.playing && (state.blocking || !state.lost), queue: step && !state.menuOpen, step, draw: state.playing && state.presenting };
}
