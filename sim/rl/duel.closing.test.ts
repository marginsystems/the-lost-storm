import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, DuelClosing } from '../content/types.ts';
import { must, zoneOf } from '../../test/support.ts';
import type { ClosingState } from '../world/closing.ts';
import type { PlayerState } from '../world/types.ts';
import type { Duel } from './duel.ts';
import { createDuel, DUEL } from './duel.ts';

const CONTENT: Content = loadContent();

void test('the Proving Ground closes in on a duel that drags on', (): void => {
  const rules: DuelClosing = must(must(zoneOf(CONTENT, 'proving_ground').duel, 'duel').closing, 'closing');
  assert.ok(rules.after + rules.over < DUEL.timeLimit, 'the edge closes before a training duel runs out');
});

void test('a training duel opens a closing edge between its two heroes', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: 41, jitter: 0 });
  const closing: ClosingState = must(duel.world.closing, 'closing');
  const a: PlayerState = must(duel.seats[0], 'first seat').hero;
  const b: PlayerState = must(duel.seats[1], 'second seat').hero;
  assert.ok(Math.abs(closing.centre.x - (a.pos.x + b.pos.x) / 2) < 1e-9);
  assert.ok(Math.abs(closing.centre.z - (a.pos.z + b.pos.z) / 2) < 1e-9);
  assert.equal(closing.startsAt, duel.start + must(duel.world.zone.duel?.closing, 'rules').after);
});

void test('a cornering drill keeps its open floor', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: 41, jitter: 0, corner: true });
  assert.equal(duel.world.closing, null);
});
