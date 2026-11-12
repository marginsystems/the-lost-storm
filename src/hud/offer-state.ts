export interface OfferUi {
  readonly offer: string | null;
  readonly open: boolean;
}

export type OfferInput = { readonly type: 'pending'; readonly offer: string | null } | { readonly type: 'open' } | { readonly type: 'close' };

export const OFFER_IDLE: OfferUi = { offer: null, open: false };

export function stepOffer(ui: OfferUi, input: OfferInput): OfferUi {
  if (input.type === 'pending') return input.offer === ui.offer ? ui : { offer: input.offer, open: false };
  if (input.type === 'open') return ui.offer === null ? ui : { offer: ui.offer, open: true };
  return ui.open ? { offer: ui.offer, open: false } : ui;
}

export function markerShown(ui: OfferUi): boolean {
  return ui.offer !== null && !ui.open;
}
