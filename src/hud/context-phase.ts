export type ContextPhase = 'live' | 'lost' | 'restoring' | 'failed' | 'faulted';

export type ContextSignal = { readonly type: 'lost' } | { readonly type: 'restored' } | { readonly type: 'timeout' } | { readonly type: 'frame'; readonly contextLost: boolean } | { readonly type: 'fault' };

export function nextContextPhase(phase: ContextPhase, signal: ContextSignal): ContextPhase {
  if (phase === 'faulted') return phase;
  let next: ContextPhase;
  switch (signal.type) {
    case 'fault':
      next = 'faulted';
      break;
    case 'lost':
      next = 'lost';
      break;
    case 'restored':
      next = phase === 'live' ? 'live' : 'restoring';
      break;
    case 'timeout':
      next = phase === 'lost' || phase === 'restoring' ? 'failed' : phase;
      break;
    case 'frame':
      next = signal.contextLost ? (phase === 'live' ? 'lost' : phase) : 'live';
      break;
  }
  return next;
}

export function contextNoticeShown(phase: ContextPhase): boolean {
  return phase !== 'live';
}

export function contextReloadOffered(phase: ContextPhase): boolean {
  return phase === 'failed' || phase === 'faulted';
}

export function contextPolls(phase: ContextPhase): boolean {
  return phase !== 'live' && phase !== 'faulted';
}

export function contextWaits(phase: ContextPhase): boolean {
  return phase === 'lost' || phase === 'restoring';
}
