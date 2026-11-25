import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ShapeDelivery } from './parse-shapes.ts';
import { shapeDelivery } from './parse-shapes.ts';
import { ContentError } from './read.ts';

const STANDING: Readonly<Record<string, unknown>> = { range: 0, radius: 7, duration: 30, pulse: 0, pull: 0, slow: 1, anchor: 'caster' };

void test('an area reads an aura: changes for its caster, changes to skills, and skills that land harder on enemies inside it', (): void => {
  const read: ShapeDelivery = shapeDelivery('area', { ...STANDING, aura: { statMods: [{ stat: 'manaRegen', op: 'add', value: 4 }], skillMods: [{ group: 'lightning', field: 'cooldownPercent', value: -0.2 }], exposes: [{ group: 'lightning', value: 0.2 }] } }, 'x');
  assert.equal(read.type, 'area');
  assert.deepEqual(read.aura, {
    statMods: [{ stat: 'manaRegen', op: 'add', value: 4 }],
    skillMods: [{ target: { type: 'group', group: 'lightning' }, field: 'cooldownPercent', value: -0.2 }],
    exposes: [{ target: { type: 'group', group: 'lightning' }, value: 0.2 }],
  });
  const plain: ShapeDelivery = shapeDelivery('area', STANDING, 'x');
  assert.equal(plain.type, 'area');
  assert.equal(plain.aura, null);
});

void test('an aura that changes nothing, stands on the ground, or exposes by nothing is refused', (): void => {
  assert.throws((): unknown => shapeDelivery('area', { ...STANDING, aura: {} }, 'x'), ContentError);
  assert.throws((): unknown => shapeDelivery('area', { ...STANDING, anchor: 'ground', aura: { exposes: [{ skill: 'squall', value: 0.2 }] } }, 'x'), ContentError);
  assert.throws((): unknown => shapeDelivery('area', { ...STANDING, aura: { exposes: [{ skill: 'squall', value: 0 }] } }, 'x'), ContentError);
  assert.throws((): unknown => shapeDelivery('area', { ...STANDING, aura: { exposes: [{ value: 0.2 }] } }, 'x'), ContentError);
});
