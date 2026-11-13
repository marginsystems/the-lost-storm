import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSaleOffer } from './sale-offer.ts';
import type { SaleOffer } from './sale-offer.ts';

void test('an offer tells its watchers only when the offered item changes', (): void => {
  const offer: SaleOffer = createSaleOffer();
  const heard: (number | null)[] = [];
  offer.watch((uid: number | null): void => {
    heard.push(uid);
  });
  assert.equal(offer.uid(), null);
  offer.set(7);
  offer.set(7);
  offer.set(9);
  offer.set(null);
  offer.set(null);
  assert.equal(offer.uid(), null);
  assert.deepEqual(heard, [7, 9, null]);
});
