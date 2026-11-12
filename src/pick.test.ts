import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PickCandidate } from './pick.ts';
import { pickActor } from './pick.ts';

const BODY = { minX: 100, minY: 100, maxX: 140, maxY: 220 };

function candidate(overrides: Partial<PickCandidate>): PickCandidate {
  return { id: 1, kind: 'npc', body: BODY, footGap: 9, depth: 20, ...overrides };
}

void test('a point on the body picks the character even far above the ground disc', (): void => {
  assert.equal(pickActor([candidate({})], { x: 120, y: 130 }, null)?.id, 1);
});

void test('a point on the ground disc picks the character without touching the body', (): void => {
  assert.equal(pickActor([candidate({ footGap: 0.3 })], { x: 500, y: 500 }, null)?.id, 1);
});

void test('a point on the name label picks the character', (): void => {
  assert.equal(pickActor([candidate({})], { x: 500, y: 500 }, 1)?.id, 1);
});

void test('a point on nothing picks nothing', (): void => {
  assert.equal(pickActor([candidate({})], { x: 500, y: 500 }, null), null);
});

void test('overlapping characters resolve to the one nearest the camera', (): void => {
  const far: PickCandidate = candidate({ id: 1, depth: 30 });
  const near: PickCandidate = candidate({ id: 2, depth: 20 });
  assert.equal(pickActor([far, near], { x: 120, y: 130 }, null)?.id, 2);
});

void test('a monster wins over an overlapping person', (): void => {
  const person: PickCandidate = candidate({ id: 1, kind: 'npc', depth: 10 });
  const monster: PickCandidate = candidate({ id: 2, kind: 'monster', depth: 30 });
  assert.equal(pickActor([person, monster], { x: 120, y: 130 }, null)?.id, 2);
});
