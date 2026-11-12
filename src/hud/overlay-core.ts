import { dependentsOf, OVERLAY_IDS, OVERLAY_TABLE, paired } from './overlay-table.ts';
import type { OverlayId, QueuedOverlay } from './overlay-table.ts';

export type OverlayPhase = 'closed' | 'opening' | 'open' | 'closing';

export interface OverlayState {
  readonly phase: Readonly<Record<OverlayId, OverlayPhase>>;
  readonly pending: readonly OverlayId[];
  readonly waiting: readonly QueuedOverlay[];
  readonly narrow: boolean;
}

export type OverlayEvent =
  | { readonly type: 'toggle'; readonly id: OverlayId }
  | { readonly type: 'open'; readonly id: OverlayId }
  | { readonly type: 'close'; readonly id: OverlayId }
  | { readonly type: 'escape' }
  | { readonly type: 'settled'; readonly id: OverlayId }
  | { readonly type: 'death' }
  | { readonly type: 'respawn' }
  | { readonly type: 'zone' }
  | { readonly type: 'arrive'; readonly id: QueuedOverlay }
  | { readonly type: 'present' }
  | { readonly type: 'layout'; readonly narrow: boolean };

export type OverlayOutcome = 'shown' | 'waiting' | 'refused' | 'closing' | 'ignored';

export interface OverlayStep {
  readonly state: OverlayState;
  readonly outcome: OverlayOutcome;
}

type Phases = Record<OverlayId, OverlayPhase>;

function closedPhases(): Phases {
  return { character: 'closed', inventory: 'closed', trade: 'closed', chart: 'closed', map: 'closed', ladder: 'closed', reader: 'closed', endcard: 'closed', pause: 'closed', death: 'closed' };
}

export const INITIAL_OVERLAYS: OverlayState = { phase: closedPhases(), pending: [], waiting: [], narrow: false };

export function isShown(state: OverlayState, id: OverlayId): boolean {
  const phase: OverlayPhase = state.phase[id];
  return phase === 'opening' || phase === 'open';
}

export function visibleOverlays(state: OverlayState): OverlayId[] {
  return OVERLAY_IDS.filter((id: OverlayId): boolean => isShown(state, id));
}

export function exitingOverlays(state: OverlayState): OverlayId[] {
  return OVERLAY_IDS.filter((id: OverlayId): boolean => state.phase[id] === 'closing');
}

export function liveOverlays(state: OverlayState): OverlayId[] {
  return OVERLAY_IDS.filter((id: OverlayId): boolean => state.phase[id] !== 'closed');
}

export function chromeHidden(state: OverlayState): boolean {
  return OVERLAY_IDS.some((id: OverlayId): boolean => OVERLAY_TABLE[id].layer === 'full' && state.phase[id] !== 'closed');
}

export function anyOverlay(state: OverlayState): boolean {
  return liveOverlays(state).length > 0;
}

export function topOverlay(state: OverlayState, except: OverlayId | null): OverlayId | null {
  const shown: OverlayId[] = visibleOverlays(state).filter((id: OverlayId): boolean => id !== except);
  return shown.at(-1) ?? null;
}

function withDependents(ids: readonly OverlayId[]): OverlayId[] {
  const all: Set<OverlayId> = new Set<OverlayId>(ids);
  for (const id of ids) for (const dependent of dependentsOf(id)) all.add(dependent);
  return OVERLAY_IDS.filter((id: OverlayId): boolean => all.has(id));
}

function targetOf(state: OverlayState, id: OverlayId): OverlayId[] {
  const required: OverlayId | null = OVERLAY_TABLE[id].requires;
  return OVERLAY_IDS.filter((other: OverlayId): boolean => other === id || other === required || (isShown(state, other) && paired(other, id, state.narrow)));
}

function blocked(state: OverlayState, id: OverlayId): boolean {
  return OVERLAY_IDS.some((other: OverlayId): boolean => other !== id && OVERLAY_TABLE[other].blocks && (isShown(state, other) || state.pending.includes(other)));
}

function settle(state: OverlayState, phase: Phases, pending: readonly OverlayId[], outcome: OverlayOutcome): OverlayStep {
  return { state: { ...state, phase, pending: OVERLAY_IDS.filter((id: OverlayId): boolean => pending.includes(id)) }, outcome };
}

function marking(state: OverlayState, ids: readonly OverlayId[], phase: OverlayPhase): Phases {
  const next: Phases = { ...state.phase };
  for (const id of ids) next[id] = phase;
  return next;
}

function accept(state: OverlayState, id: OverlayId): OverlayStep {
  const target: OverlayId[] = targetOf(state, id);
  const shown: OverlayId[] = visibleOverlays(state);
  const out: OverlayId[] = withDependents(shown.filter((other: OverlayId): boolean => !target.includes(other))).filter((other: OverlayId): boolean => shown.includes(other));
  const entering: OverlayId[] = target.filter((other: OverlayId): boolean => !shown.includes(other));
  const leaving: Phases = marking(state, out, 'closing');
  if (exitingOverlays(state).length === 0 && out.length === 0) {
    const next: Phases = { ...leaving };
    for (const other of entering) next[other] = 'opening';
    return settle(state, next, [], 'shown');
  }
  return settle(state, leaving, entering, 'waiting');
}

function request(state: OverlayState, id: OverlayId): OverlayStep {
  if (isShown(state, id)) return { state, outcome: 'shown' };
  if (state.pending.includes(id)) return { state, outcome: 'waiting' };
  if (blocked(state, id)) return { state, outcome: 'refused' };
  return accept(state, id);
}

function dismiss(state: OverlayState, id: OverlayId): OverlayStep {
  if (!isShown(state, id) && !state.pending.includes(id)) return { state, outcome: 'ignored' };
  const gone: OverlayId[] = withDependents([id]);
  const out: OverlayId[] = gone.filter((other: OverlayId): boolean => isShown(state, other));
  return settle(state, marking(state, out, 'closing'), state.pending.filter((other: OverlayId): boolean => !gone.includes(other)), 'closing');
}

function escape(state: OverlayState): OverlayStep {
  const top: OverlayId | null = topOverlay(state, 'death');
  if (top !== null) return dismiss(state, top);
  if (visibleOverlays(state).length > 0) return { state, outcome: 'ignored' };
  if (state.pending.some((id: OverlayId): boolean => id !== 'death')) return settle(state, { ...state.phase }, state.pending.filter((id: OverlayId): boolean => id === 'death'), 'closing');
  if (state.pending.length > 0) return { state, outcome: 'ignored' };
  return request(state, 'pause');
}

function settled(state: OverlayState, id: OverlayId): OverlayStep {
  const phase: OverlayPhase = state.phase[id];
  if (phase === 'opening') return settle(state, marking(state, [id], 'open'), state.pending, 'shown');
  if (phase !== 'closing') return { state, outcome: 'ignored' };
  const done: Phases = marking(state, [id], 'closed');
  const others: OverlayId[] = exitingOverlays(state).filter((other: OverlayId): boolean => other !== id);
  if (others.length > 0 || state.pending.length === 0) return settle(state, done, state.pending, 'closing');
  for (const other of state.pending) done[other] = 'opening';
  return settle(state, done, [], 'shown');
}

function death(state: OverlayState): OverlayStep {
  if (isShown(state, 'death') || state.pending.includes('death')) return { state, outcome: 'ignored' };
  if (liveOverlays(state).length === 0) return settle(state, marking(state, ['death'], 'opening'), [], 'shown');
  return settle(state, marking(state, visibleOverlays(state), 'closing'), ['death'], 'waiting');
}

function zone(state: OverlayState): OverlayStep {
  const out: OverlayId[] = visibleOverlays(state).filter((id: OverlayId): boolean => id !== 'death');
  return settle(state, marking(state, out, 'closing'), state.pending.filter((id: OverlayId): boolean => id === 'death'), 'closing');
}

function layout(state: OverlayState, narrow: boolean): OverlayStep {
  if (narrow === state.narrow) return { state, outcome: 'ignored' };
  const near: ReadonlySet<OverlayId> = new Set<OverlayId>([...visibleOverlays(state), ...state.pending]);
  const crowded: boolean = narrow && near.has('inventory') && near.has('character');
  const resized: OverlayState = { ...state, narrow };
  if (!crowded) return { state: resized, outcome: 'ignored' };
  const out: OverlayId[] = isShown(state, 'character') ? ['character'] : [];
  return settle(resized, marking(state, out, 'closing'), state.pending.filter((id: OverlayId): boolean => id !== 'character'), 'closing');
}

function waitingWith(state: OverlayState, waiting: readonly QueuedOverlay[]): OverlayState {
  return { ...state, waiting };
}

function present(state: OverlayState): OverlayStep {
  if (!state.waiting.includes('endcard') || isShown(state, 'endcard') || liveOverlays(state).length > 0 || state.pending.length > 0) return { state, outcome: 'ignored' };
  const shown: OverlayState = { ...state, phase: marking(state, ['endcard'], 'opening') };
  return { state: waitingWith(shown, []), outcome: 'shown' };
}

function requestable(id: OverlayId): boolean {
  return id !== 'endcard' && id !== 'death';
}

export function stepOverlays(state: OverlayState, event: OverlayEvent): OverlayStep {
  let step: OverlayStep;
  switch (event.type) {
    case 'toggle':
      if (event.id === 'death') step = { state, outcome: 'ignored' };
      else step = isShown(state, event.id) || state.pending.includes(event.id) ? dismiss(state, event.id) : stepOverlays(state, { type: 'open', id: event.id });
      break;
    case 'open':
      step = requestable(event.id) ? request(state, event.id) : { state, outcome: 'ignored' };
      break;
    case 'close':
      step = event.id === 'death' ? { state, outcome: 'ignored' } : dismiss(state, event.id);
      break;
    case 'escape':
      step = escape(state);
      break;
    case 'settled':
      step = settled(state, event.id);
      break;
    case 'death':
      step = death(state);
      break;
    case 'respawn':
      step = state.phase.death === 'open' ? dismiss(state, 'death') : { state, outcome: 'ignored' };
      break;
    case 'zone':
      step = zone(state);
      break;
    case 'arrive':
      if (state.waiting.includes(event.id) || state.phase[event.id] !== 'closed') {
        step = { state, outcome: 'ignored' };
        break;
      }
      step = { state: waitingWith(state, [...state.waiting, event.id]), outcome: 'waiting' };
      break;
    case 'present':
      step = present(state);
      break;
    case 'layout':
      step = layout(state, event.narrow);
      break;
  }
  return step;
}
