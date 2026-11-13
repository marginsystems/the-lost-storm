export interface CardState {
  readonly open: boolean;
  readonly hovered: string | null;
  readonly pinned: string | null;
  readonly pending: string | null;
}

export type CardEvent =
  | { readonly type: 'open' }
  | { readonly type: 'close' }
  | { readonly type: 'clear' }
  | { readonly type: 'point'; readonly node: string | null }
  | { readonly type: 'dwell' }
  | { readonly type: 'grace' }
  | { readonly type: 'enter_card' }
  | { readonly type: 'leave_card' }
  | { readonly type: 'pin'; readonly node: string };

export type CardTimer = 'none' | 'stop' | 'dwell' | 'grace';

export interface CardStep {
  readonly state: CardState;
  readonly timer: CardTimer;
}

export const CLOSED_CARD: CardState = { open: false, hovered: null, pinned: null, pending: null };

const OPEN_CARD: CardState = { ...CLOSED_CARD, open: true };

function point(state: CardState, node: string | null): CardStep {
  const pinLost: boolean = state.pinned !== null && node !== state.pinned;
  const hovered: string | null = pinLost ? (state.hovered ?? state.pinned) : state.hovered;
  const pinned: string | null = pinLost ? null : state.pinned;
  if (!pinLost && node === state.pending) return { state, timer: 'none' };
  const next: CardState = { ...state, hovered, pinned, pending: node };
  if (node === null) return { state: next, timer: hovered !== null ? 'grace' : 'stop' };
  if (node === hovered) return { state: next, timer: 'stop' };
  return { state: next, timer: 'dwell' };
}

export function stepCard(state: CardState, event: CardEvent): CardStep {
  let step: CardStep = { state, timer: 'none' };
  switch (event.type) {
    case 'open':
      step = { state: OPEN_CARD, timer: 'stop' };
      break;
    case 'close':
      step = { state: CLOSED_CARD, timer: 'stop' };
      break;
    case 'clear':
      step = { state: state.open ? OPEN_CARD : CLOSED_CARD, timer: 'stop' };
      break;
    case 'point':
      step = state.open ? point(state, event.node) : { state, timer: 'stop' };
      break;
    case 'dwell':
      step = { state: state.open && state.pending !== null ? { ...state, hovered: state.pending } : state, timer: 'none' };
      break;
    case 'grace':
      step = { state: state.open ? { ...state, hovered: null } : state, timer: 'none' };
      break;
    case 'enter_card':
      step = { state: state.open ? { ...state, pending: null } : state, timer: 'stop' };
      break;
    case 'leave_card':
      step = { state, timer: state.open && state.hovered !== null ? 'grace' : 'none' };
      break;
    case 'pin':
      step = state.open ? { state: { ...state, hovered: null, pinned: event.node, pending: event.node }, timer: 'stop' } : { state, timer: 'stop' };
      break;
  }
  return step;
}

export function cardNode(state: CardState): string | null {
  return state.open ? (state.hovered ?? state.pinned) : null;
}
