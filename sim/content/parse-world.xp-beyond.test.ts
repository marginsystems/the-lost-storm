import assert from 'node:assert/strict';
import { test } from 'node:test';
import shippedWorld from '../../data/world.json' with { type: 'json' };
import { worldDef } from './parse-world.ts';
import type { WorldDef } from './types.ts';

const flat = { lifePerLevel: 0.3, damagePerLevel: 0.28, xpPerLevel: 0.15 };

function withScaling(scaling: Readonly<Record<string, unknown>>): WorldDef {
  return worldDef({ ...shippedWorld, scaling }, 'world');
}

void test('the rule for experience above a level is read when given and absent means none', (): void => {
  assert.deepEqual(withScaling({ ...flat, xpBeyond: { from: 30, growth: 1.1, lift: 2 } }).scaling.xpBeyond, { from: 30, growth: 1.1, lift: 2 });
  assert.equal(withScaling(flat).scaling.xpBeyond, null);
});

void test('a rule that starts at part of a level or grows by nothing is refused', (): void => {
  assert.throws((): WorldDef => withScaling({ ...flat, xpBeyond: { from: 30.5, growth: 1.1, lift: 2 } }), /whole level/);
  assert.throws((): WorldDef => withScaling({ ...flat, xpBeyond: { from: 30, growth: 0, lift: 2 } }), /world\.scaling\.xpBeyond/);
  assert.throws((): WorldDef => withScaling({ ...flat, xpBeyond: { from: 30, growth: 0.9, lift: 2 } }), /cannot shrink/);
  assert.throws((): WorldDef => withScaling({ ...flat, xpBeyond: { from: 30, growth: 1.1 } }), /world\.scaling\.xpBeyond/);
});
