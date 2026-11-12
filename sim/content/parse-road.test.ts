import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ContentError } from './read.ts';
import { actEnd, drifts, retiredZones, triggers } from './parse-road.ts';

const DRIFT = { id: 'a', column: 1, row: 2, columns: 2, rows: 1, period: 12, open: 0.6, offset: 3, fade: 1.5 } as const;

void test('drifts read whole cells, a period, an open share and a fade that fits', (): void => {
  assert.deepEqual(drifts(undefined, 'zone.drifts'), []);
  assert.deepEqual(drifts([DRIFT], 'zone.drifts'), [DRIFT]);
  assert.throws(() => drifts([{ ...DRIFT, open: 1 }], 'zone.drifts'), ContentError);
  assert.throws(() => drifts([{ ...DRIFT, column: 1.5 }], 'zone.drifts'), ContentError);
  assert.throws(() => drifts([{ ...DRIFT, fade: 4 }], 'zone.drifts'), ContentError);
  assert.throws(() => drifts([DRIFT, DRIFT], 'zone.drifts'), ContentError);
});

void test('a trigger must set a flag', (): void => {
  const read = triggers([{ id: 't', x: 1, z: 2, radius: 3, sets: { seen: 'yes' } }], 'zone.triggers');
  assert.deepEqual(read, [{ id: 't', x: 1, z: 2, radius: 3, when: [], sets: { seen: 'yes' } }]);
  assert.throws(() => triggers([{ id: 't', x: 1, z: 2, radius: 3, sets: {} }], 'zone.triggers'), ContentError);
});

void test('an act end needs a condition and a line; retired zones name where they lead', (): void => {
  assert.equal(actEnd(undefined, 'act.end'), null);
  assert.deepEqual(actEnd({ when: [{ type: 'flag', flag: 'doors', is: 'open' }], line: 'The doors open.' }, 'act.end'), { when: [{ type: 'flag', flag: 'doors', is: 'open', not: false }], line: 'The doors open.' });
  assert.throws(() => actEnd({ when: [], line: 'x' }, 'act.end'), ContentError);
  assert.deepEqual(retiredZones({ zones: ['old'], to: 'hub' }, 'world.retired'), { zones: ['old'], to: 'hub', flags: {} });
});
