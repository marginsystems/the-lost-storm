import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickTarget, TARGETING } from './target.ts';
import type { Candidate } from './target.ts';

function monster(id: number, over: Partial<Candidate> = {}): Candidate {
  return { id, alive: true, aggro: false, def: { boss: null }, ...over };
}

type Picked = ReturnType<typeof pickTarget<Candidate>>;

const GRACE: number = TARGETING.grace;

void test('nothing hovered and nothing struck gives no target', (): void => {
  assert.equal(pickTarget([monster(1)], null, null, GRACE), null);
});

void test('the hovered living monster is the target', (): void => {
  const picked: Picked | null = pickTarget([monster(1), monster(2)], 2, null, GRACE);
  assert.equal(picked?.monster.id, 2);
  assert.equal(picked.kind, 'monster');
});

void test('hover beats a recent hit on another monster', (): void => {
  assert.equal(pickTarget([monster(1), monster(2)], 2, { id: 1, age: 0.1 }, GRACE)?.monster.id, 2);
});

void test('a recent hit stays the target within the grace time, dead or alive', (): void => {
  assert.equal(pickTarget([monster(1)], null, { id: 1, age: GRACE - 0.1 }, GRACE)?.monster.id, 1);
  assert.equal(pickTarget([monster(1, { alive: false })], null, { id: 1, age: 0.5 }, GRACE)?.monster.id, 1);
});

void test('a recent hit is dropped after the grace time or when the monster is gone', (): void => {
  assert.equal(pickTarget([monster(1)], null, { id: 1, age: GRACE + 0.1 }, GRACE), null);
  assert.equal(pickTarget([monster(2)], null, { id: 1, age: 0 }, GRACE), null);
});

void test('a dead hovered monster is not the target', (): void => {
  assert.equal(pickTarget([monster(1, { alive: false })], 1, null, GRACE), null);
});

void test('an engaged boss takes the slot over hover and hits', (): void => {
  const boss: Candidate = monster(3, { aggro: true, def: { boss: {} } });
  const picked: Picked | null = pickTarget([monster(1), boss], 1, { id: 1, age: 0 }, GRACE);
  assert.equal(picked?.monster.id, 3);
  assert.equal(picked.kind, 'boss');
});

void test('an idle or dead boss does not take the slot', (): void => {
  const idle: Candidate = monster(3, { def: { boss: {} } });
  const dead: Candidate = monster(4, { aggro: true, alive: false, def: { boss: {} } });
  assert.equal(pickTarget([idle, dead, monster(1)], 1, null, GRACE)?.kind, 'monster');
});
