import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACTION_HEADS, contractShape, ENTITY_FEATURES, LAYOUT, RL, SELF_FEATURES, SLOT_FEATURES } from './contract.ts';

const SHIPPED = { version: 1, fingerprint: '518d06e3' } as const;

void test('the observation contract keeps the fingerprint its version shipped with', (): void => {
  const shape = contractShape();
  assert.equal(shape.version, SHIPPED.version);
  assert.equal(shape.fingerprint, SHIPPED.fingerprint, 'the observation or action layout changed: raise RL.version, update SHIPPED, and widen saved policies');
});

void test('every feature has a unique name', (): void => {
  for (const names of [SELF_FEATURES, SLOT_FEATURES, ENTITY_FEATURES]) assert.equal(new Set(names).size, names.length);
});

void test('the layout adds up to the observation size and the mask covers every head', (): void => {
  assert.equal(LAYOUT.size, SELF_FEATURES.length + SLOT_FEATURES.length * RL.slots + ENTITY_FEATURES.length * RL.entities + RL.rays);
  assert.equal(LAYOUT.mask, ACTION_HEADS.reduce((sum: number, choices: number): number => sum + choices, 0));
  assert.equal(ACTION_HEADS.length, RL.actionParts);
});
