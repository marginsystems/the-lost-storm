import assert from 'node:assert/strict';
import { test } from 'node:test';
import hall from '../../data/zones/hall_of_time.json' with { type: 'json' };
import type { ZoneDef } from './types.ts';
import { zone } from './parse-world.ts';

function parsed(change: Readonly<Record<string, unknown>>): ZoneDef {
  return zone({ ...hall, ...change }, 'zone');
}

void test('a zone without a level cap stays at its own level and one with a cap reads it', (): void => {
  const fixed: ZoneDef = parsed({ level: 3, levelUpTo: undefined });
  assert.equal(fixed.levelUpTo, 3);
  assert.equal(parsed({ level: 2, levelUpTo: 9 }).levelUpTo, 9);
});

void test('a zone cannot follow the hero below its own level', (): void => {
  assert.throws((): ZoneDef => parsed({ level: 5, levelUpTo: 4 }), /below its own level/);
});

void test('pack return rules are read when given and absent otherwise', (): void => {
  assert.deepEqual(parsed({ packReturn: { after: 30, away: 12 } }).packReturn, { after: 30, away: 12 });
  assert.equal(parsed({ packReturn: undefined }).packReturn, null);
  assert.throws((): ZoneDef => parsed({ packReturn: { after: 0, away: 12 } }));
});
