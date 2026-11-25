import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content.ts';
import type { Content, ZoneDef } from './types.ts';
import { contentProblems } from './parse.ts';
import { must } from '../../test/support.ts';
import { RING, ringContent } from '../../test/rival-support.ts';

const CONTENT: Content = ringContent(loadContent());

function withRing(change: (ring: ZoneDef) => ZoneDef): Content {
  const ring: ZoneDef = must(CONTENT.zones.get(RING.id), 'ring');
  return { ...CONTENT, zones: new Map<string, ZoneDef>([...CONTENT.zones, [RING.id, change(ring)]]) };
}

function ringProblems(content: Content): string[] {
  return contentProblems(content).filter((problem: string): boolean => problem.includes(RING.id) && problem.includes('duel'));
}

void test('a duel zone that sends the duellist home through a real exit of another zone passes', (): void => {
  assert.deepEqual(ringProblems(CONTENT), []);
});

void test('a duel zone whose home is not an exit of another zone is refused', (): void => {
  const lost: Content = withRing((ring: ZoneDef): ZoneDef => ({ ...ring, duel: { rival: { x: 1, z: 1 }, home: { zone: 'hideout', exit: 'nowhere' }, gear: 'own', heroDamage: 1 } }));
  assert.equal(ringProblems(lost).length, 1);
  const itself: Content = withRing((ring: ZoneDef): ZoneDef => ({ ...ring, duel: { rival: { x: 1, z: 1 }, home: { zone: RING.id, exit: 'east' }, gear: 'own', heroDamage: 1 } }));
  assert.equal(ringProblems(itself).length, 1);
});

void test('a duel zone with packs is refused', (): void => {
  const hall: ZoneDef = must(CONTENT.zones.get(RING.from), 'hall');
  const packed: Content = withRing((ring: ZoneDef): ZoneDef => ({ ...ring, packs: hall.packs }));
  assert.ok(ringProblems(packed).some((problem: string): boolean => problem.includes('packs')));
});
