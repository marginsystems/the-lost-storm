import type { Rating } from './alpha.ts';

export type PendingEvent =
  | { readonly kind: 'rate'; readonly rating: Rating }
  | { readonly kind: 'type'; readonly text: string }
  | { readonly kind: 'submit' }
  | { readonly kind: 'close' }
  | { readonly kind: 'idle' }
  | { readonly kind: 'hide' };

export interface Pending {
  readonly rating: Rating | null;
  readonly text: string;
  readonly posted: boolean;
}

export interface PendingPost {
  readonly rating: Rating;
  readonly text: string;
}

export interface PendingStep {
  readonly pending: Pending;
  readonly post: PendingPost | null;
}

export const EMPTY_PENDING: Pending = { rating: null, text: '', posted: false };

export function armed(pending: Pending): boolean {
  return pending.rating !== null && !pending.posted;
}

function release(pending: Pending): PendingStep {
  if (pending.rating === null) return { pending, post: null };
  return { pending: { ...pending, posted: true }, post: { rating: pending.rating, text: pending.text } };
}

function change(pending: Pending, event: PendingEvent): PendingStep {
  if (event.kind === 'rate') return { pending: { ...pending, rating: event.rating }, post: null };
  if (event.kind === 'type') return pending.rating === null ? { pending, post: null } : { pending: { ...pending, text: event.text }, post: null };
  return release(pending);
}

export function stepPending(pending: Pending, event: PendingEvent): PendingStep {
  return pending.posted ? { pending, post: null } : change(pending, event);
}
