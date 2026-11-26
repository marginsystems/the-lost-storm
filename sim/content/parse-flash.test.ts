import assert from 'node:assert/strict';
import { test } from 'node:test';
import { zoneFlash } from './parse-flash.ts';
import { ContentError } from './read.ts';

const BASE = {
  from: 'town',
  when: [{ type: 'flag', flag: 'seen', not: true }],
  calm: 2,
  seconds: 20,
  seam: 2,
  into: 'white',
  sets: { seen: 'yes' },
} as const;

void test('a zone with no flash has none', (): void => {
  assert.equal(zoneFlash(undefined, 'zone.flash'), null);
  assert.equal(zoneFlash(null, 'zone.flash'), null);
});

void test('a flash reads its start, length, seam and the door that tears it early', (): void => {
  assert.deepEqual(zoneFlash({ ...BASE, threshold: { x: 1, z: 2, radius: 3 } }, 'zone.flash'), {
    from: 'town',
    when: [{ type: 'flag', flag: 'seen', is: null, not: true }],
    calm: 2,
    seconds: 20,
    seam: 2,
    threshold: { x: 1, z: 2, radius: 3 },
    into: 'white',
    sets: { seen: 'yes' },
  });
  assert.equal(zoneFlash(BASE, 'zone.flash')?.threshold, null);
});

void test('a seam that does not start before the flash runs out is refused', (): void => {
  assert.throws((): void => void zoneFlash({ ...BASE, seam: 20 }, 'zone.flash'), ContentError);
});

void test('a flash that does not wait on a flag it sets could play twice, so it is refused', (): void => {
  assert.throws((): void => void zoneFlash({ ...BASE, sets: { other: 'yes' } }, 'zone.flash'), ContentError);
  assert.throws((): void => void zoneFlash({ ...BASE, when: [] }, 'zone.flash'), ContentError);
  assert.throws((): void => void zoneFlash({ ...BASE, when: [{ type: 'flag', flag: 'seen', is: 'yes', not: true }] }, 'zone.flash'), ContentError);
});
