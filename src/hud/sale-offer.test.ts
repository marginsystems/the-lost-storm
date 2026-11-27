import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSaleOffer } from './sale-offer.ts';

void test('a bag selection keeps separate item identities and can be taken back', (): void => {
  const offer = createSaleOffer();
  offer.toggle(7);
  offer.toggle(9);
  assert.deepEqual(offer.uids(), [7, 9]);
  offer.toggle(7);
  assert.deepEqual(offer.uids(), [9]);
  offer.clear();
  assert.deepEqual(offer.uids(), []);
});
