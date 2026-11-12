import assert from 'node:assert/strict';
import { test } from 'node:test';
import { beadStates } from './flask-belt.ts';

void test('a full flask shows every use as a ready bead', (): void => {
  assert.deepEqual(beadStates({ charges: 30, chargesPerUse: 10, maxCharges: 30 }), [
    { ready: true, fill: 1 },
    { ready: true, fill: 1 },
    { ready: true, fill: 1 },
  ]);
});

void test('a drink spends one bead and the next one shows how far it has filled', (): void => {
  assert.deepEqual(beadStates({ charges: 13, chargesPerUse: 10, maxCharges: 30 }), [
    { ready: true, fill: 1 },
    { ready: false, fill: 0.3 },
    { ready: false, fill: 0 },
  ]);
});

void test('an empty flask shows every bead spent', (): void => {
  assert.ok(beadStates({ charges: 0, chargesPerUse: 8, maxCharges: 30 }).every((bead): boolean => !bead.ready && bead.fill === 0));
});

void test('charges beyond the last whole use do not add a bead', (): void => {
  assert.equal(beadStates({ charges: 30, chargesPerUse: 8, maxCharges: 30 }).length, 3);
});
