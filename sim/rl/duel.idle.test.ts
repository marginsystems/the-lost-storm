import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, SkillDef } from '../content/types.ts';
import { must } from '../../test/support.ts';
import { applyHit, offenceOf } from '../world/combat.ts';
import type { WorldEvent } from '../world/types.ts';
import type { Duel, DuelSeat } from './duel.ts';
import { afterDuelTick, chargeIdle, createDuel, DUEL, stepDuel } from './duel.ts';
import { REWARD } from './reward.ts';

const CONTENT: Content = loadContent();
const SEED: number = 73;
const CORNER_SEED: number = 11;

function seats(duel: Duel): readonly [DuelSeat, DuelSeat] {
  return [must(duel.seats[0], 'first seat'), must(duel.seats[1], 'second seat')];
}

function firstHitsSecond(duel: Duel): WorldEvent[] {
  const [first, second] = seats(duel);
  const skill: SkillDef = must(CONTENT.skills.get('cleave'), 'cleave');
  duel.world.events = [];
  assert.ok(applyHit(duel.world, offenceOf(first.hero), second.hero, skill, { x: 1, z: 0 }));
  return duel.world.events;
}

void test('a duel charges nothing while both heroes are inside the grace after the start', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: SEED, jitter: 0 });
  const rewards: number[] = [0, 0];
  chargeIdle(duel, rewards);
  assert.deepEqual(rewards, [0, 0]);
});

void test('a hero that has not hit the rival for longer than the grace pays for each decision', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: SEED, jitter: 0 });
  duel.world.time = duel.start + DUEL.idleGrace + 1;
  const rewards: number[] = [0, 0];
  chargeIdle(duel, rewards);
  assert.deepEqual(rewards, [-DUEL.idle, -DUEL.idle]);
  for (const seat of seats(duel)) assert.equal(seat.total, -DUEL.idle);
});

void test('landing a hit on the rival resets only the striker\'s grace', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: SEED, jitter: 0 });
  duel.world.time = duel.start + DUEL.idleGrace + 1;
  afterDuelTick(duel, firstHitsSecond(duel), [0, 0]);
  const rewards: number[] = [0, 0];
  chargeIdle(duel, rewards);
  assert.deepEqual(rewards, [0, -DUEL.idle]);
});

void test('a corner drill never charges for going without a hit', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: CORNER_SEED, jitter: 0, corner: true });
  assert.notEqual(duel.corner, null);
  duel.world.time = duel.start + DUEL.idleGrace + 1;
  const rewards: number[] = [0, 0];
  chargeIdle(duel, rewards);
  assert.deepEqual(rewards, [0, 0]);
});

void test('two heroes that stand apart for the whole duel are charged more for it than a win pays', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: SEED, jitter: 0 });
  let done: boolean = false;
  while (!done) done = stepDuel(duel, [[], []]).done;
  const [first] = seats(duel);
  assert.equal(first.outcome, 'timeout');
  const idle: number = first.total + DUEL.stalemate + duel.decisions * REWARD.step;
  assert.ok(idle < -REWARD.win);
});
