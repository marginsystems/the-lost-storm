import assert from 'node:assert/strict';
import { test } from 'node:test';
import { momentField, momentLibrary } from './parse-moments.ts';
import { ContentError } from './read.ts';

const ECHO = { monster: 'unfinished_brute', x: 1, z: 0, facingDegrees: 0, pose: { clip: 'idle', at: 0.5 }, turns: true };
const MOMENT = { id: 'fire', name: 'A campfire', tint: '#ff9a3c', bright: false, radius: 6, lifetime: 40, awake: 15, turnChance: 0.5, props: [{ prop: 'fire_pit', x: 0, z: 0, rotationDegrees: 0 }], echoes: [ECHO], reward: { goldMin: 5, goldMax: 9, items: 1, itemChance: 0.4, rarity: null } };
const LIBRARY = { faction: 'echoes', hostileTint: '#9fc4ff', telegraph: 1, fade: 2, moments: [MOMENT] };
const FIELD = { combat: true, areas: [{ x: 10, z: 10, radius: 8 }], clearance: { hero: 8, exits: 6, between: 4 }, interval: { min: 5, max: 10 }, start: 1, max: 3, table: [{ moment: 'fire', weight: 1 }] };

void test('a moment library reads its moments by id', (): void => {
  const library = momentLibrary(LIBRARY, 'moments');
  assert.equal(library.defs.get('fire')?.echoes[0]?.pose.clip, 'idle');
  assert.equal(library.fade, 2);
});

void test('an echo outside its bubble is refused', (): void => {
  assert.throws((): void => {
    momentLibrary({ ...LIBRARY, moments: [{ ...MOMENT, echoes: [{ ...ECHO, x: 9 }] }] }, 'moments');
  }, ContentError);
});

void test('a turn chance with no echo that turns is refused', (): void => {
  assert.throws((): void => {
    momentLibrary({ ...LIBRARY, moments: [{ ...MOMENT, echoes: [{ ...ECHO, turns: false }] }] }, 'moments');
  }, ContentError);
});

void test('a reward whose gold range runs backwards is refused', (): void => {
  assert.throws((): void => {
    momentLibrary({ ...LIBRARY, moments: [{ ...MOMENT, reward: { ...MOMENT.reward, goldMin: 9, goldMax: 5 } }] }, 'moments');
  }, ContentError);
});

void test('a zone without a field reads as null', (): void => {
  assert.equal(momentField(undefined, 'zone.moments'), null);
  assert.equal(momentField(null, 'zone.moments'), null);
});

void test('a field reads its areas, clearance, cadence and table', (): void => {
  const field = momentField(FIELD, 'zone.moments');
  assert.ok(field !== null);
  assert.equal(field.max, 3);
  assert.equal(field.interval.max, 10);
  assert.equal(field.table[0]?.moment, 'fire');
});

void test('a field that starts above its max, has no area or no table is refused', (): void => {
  assert.throws((): void => {
    momentField({ ...FIELD, start: 4 }, 'zone.moments');
  }, ContentError);
  assert.throws((): void => {
    momentField({ ...FIELD, areas: [] }, 'zone.moments');
  }, ContentError);
  assert.throws((): void => {
    momentField({ ...FIELD, table: [] }, 'zone.moments');
  }, ContentError);
  assert.throws((): void => {
    momentField({ ...FIELD, interval: { min: 9, max: 3 } }, 'zone.moments');
  }, ContentError);
});
