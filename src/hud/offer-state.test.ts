import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardsKey, markerShown, OFFER_IDLE, stepOffer } from './offer-state.ts';
import type { OfferUi } from './offer-state.ts';

void test('a new choice waits behind a marker and never opens itself', (): void => {
  const waiting: OfferUi = stepOffer(OFFER_IDLE, { type: 'pending', offer: 'first_moment' });
  assert.equal(waiting.open, false);
  assert.equal(markerShown(waiting), true);
  assert.equal(stepOffer(waiting, { type: 'pending', offer: 'first_moment' }), waiting);
});

void test('Escape closes an open choice and keeps it waiting, and only a second Escape is left for Pause', (): void => {
  const opened: OfferUi = stepOffer(stepOffer(OFFER_IDLE, { type: 'pending', offer: 'first_moment' }), { type: 'open' });
  assert.equal(opened.open, true);
  assert.equal(markerShown(opened), false);
  const deferred: OfferUi = stepOffer(opened, { type: 'close' });
  assert.deepEqual(deferred, { offer: 'first_moment', open: false });
  assert.equal(markerShown(deferred), true);
  assert.equal(stepOffer(deferred, { type: 'close' }), deferred);
});

void test('a choice made closes the panel, and the next offer in line waits behind the marker', (): void => {
  const opened: OfferUi = stepOffer(stepOffer(OFFER_IDLE, { type: 'pending', offer: 'first_moment' }), { type: 'open' });
  const next: OfferUi = stepOffer(opened, { type: 'pending', offer: 'fire_lesson' });
  assert.deepEqual(next, { offer: 'fire_lesson', open: false });
  assert.equal(markerShown(next), true);
  const done: OfferUi = stepOffer(next, { type: 'pending', offer: null });
  assert.equal(markerShown(done), false);
  assert.equal(stepOffer(done, { type: 'open' }), done);
});

void test('the cards are drawn again when a choice was learned while the offer waited', (): void => {
  assert.equal(cardsKey('fire_lesson', ['a', 'b', 'c']), cardsKey('fire_lesson', ['a', 'b', 'c']));
  assert.notEqual(cardsKey('fire_lesson', ['a', 'b', 'c']), cardsKey('fire_lesson', ['a', 'c']));
});
