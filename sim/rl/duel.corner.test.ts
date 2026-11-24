import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, SkillDef } from '../content/types.ts';
import { lineWalkable } from '../nav/grid.ts';
import { must } from '../../test/support.ts';
import type { Command, PlayerState, WorldEvent } from '../world/types.ts';
import { commandsFor } from './act.ts';
import type { Action } from './contract.ts';
import { MOVE_CHOICES, RL, SKILL_CHOICES } from './contract.ts';
import { CORNER, isCorner } from './corner.ts';
import type { Duel, DuelSeat } from './duel.ts';
import { cornerCleared, cornerRunAway, createDuel, DUEL, duelObservation, duelRunning, stepDuel } from './duel.ts';
import type { DuelReplay } from './duel-replay.ts';
import { readDuelReplay, recordDuelReplay, replayDuel } from './duel-replay.ts';
import type { Observation } from './observe.ts';
import { REWARD } from './reward.ts';

const CONTENT: Content = loadContent();
const CORNERS = { seeds: 24, decisions: 40 } as const;

function seat(duel: Duel, index: number): DuelSeat {
  return must(duel.seats[index], `seat ${index}`);
}

function forcedAction(mask: Uint8Array): Action {
  const pick = (from: number, count: number): number => {
    const allowed: number[] = Array.from({ length: count }, (_unused: unknown, index: number): number => index).filter((index: number): boolean => mask[from + index] === 1);
    assert.equal(allowed.length, 1, 'the caster has exactly one choice in every head');
    return must(allowed[0], 'choice');
  };
  return { move: pick(0, MOVE_CHOICES), skill: pick(MOVE_CHOICES, SKILL_CHOICES), target: pick(MOVE_CHOICES + SKILL_CHOICES, RL.targets), use: pick(MOVE_CHOICES + SKILL_CHOICES + RL.targets, mask.length - MOVE_CHOICES - SKILL_CHOICES - RL.targets) };
}

function boltOf(hero: PlayerState): SkillDef | null {
  return hero.skills[CORNER.slot] ?? null;
}

void test('every corner duel puts the rival seat in a walled corner and the first seat in the open with Storm Bolt, a clear line between them', (): void => {
  for (let seed: number = 1; seed <= CORNERS.seeds; seed += 1) {
    const duel: Duel = createDuel(CONTENT, { seed, jitter: 0.2, corner: true });
    const start = must(duel.corner, `seed ${seed} corner`);
    const caster: PlayerState = seat(duel, CORNER.casterSeat).hero;
    const cornered: PlayerState = seat(duel, CORNER.corneredSeat).hero;
    assert.deepEqual(cornered.pos, start.corner);
    assert.deepEqual(caster.pos, start.caster);
    assert.ok(isCorner(duel.world.grid, cornered.pos), `seed ${seed}: the cornered hero is walled in`);
    assert.ok(lineWalkable(duel.world.grid, cornered.pos, caster.pos), `seed ${seed}: open ground between them`);
    assert.equal(boltOf(caster)?.id, CORNER.skill);
    assert.ok(caster.alive && cornered.alive);
    assert.equal(caster.mana, caster.stats.maxMana);
  }
});

void test('the caster can only cast Storm Bolt at the cornered hero, or wait, and the cornered hero keeps every choice', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: 3, jitter: 0, corner: true });
  const caster: DuelSeat = seat(duel, CORNER.casterSeat);
  const cornered: DuelSeat = seat(duel, CORNER.corneredSeat);
  const first: Action = forcedAction(duelObservation(duel, caster).mask);
  assert.deepEqual(first, { move: 0, skill: CORNER.slot + 1, target: 0, use: 0 });
  const free: Uint8Array = duelObservation(duel, cornered).mask;
  assert.ok(free.slice(0, MOVE_CHOICES).every((allowed: number): boolean => allowed === 1), 'the cornered hero may move every way');
  let bolts: number = 0;
  let hits: number = 0;
  for (let decision: number = 0; decision < CORNERS.decisions; decision += 1) {
    const seen: Observation = duelObservation(duel, caster);
    const action: Action = forcedAction(seen.mask);
    if (action.skill === CORNER.slot + 1) bolts += 1;
    const commands: Command[][] = [commandsFor(duel.world, action, seen.view), []];
    const events: readonly WorldEvent[] = stepDuel(duel, commands).events;
    hits += events.filter((event: WorldEvent): boolean => event.type === 'damage' && event.targetId === cornered.hero.id).length;
    assert.equal(caster.hero.mana, caster.hero.stats.maxMana, 'the caster never runs dry');
    assert.equal(caster.hero.life, caster.hero.maxLife, 'the caster cannot be worn down, so only leaving the corner ends the drill early');
  }
  assert.ok(bolts > 3, `cast ${bolts} bolts`);
  assert.ok(hits > 0, 'the bolts reach the cornered hero');
});

void test('the cornered hero wins the drill by getting clear of the corner, and the caster is paid nothing for it', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: 7, jitter: 0, corner: true });
  const start = must(duel.corner, 'corner');
  const cornered: PlayerState = seat(duel, CORNER.corneredSeat).hero;
  cornered.pos = { x: start.caster.x, z: start.caster.z };
  assert.ok(cornerCleared(duel));
  const step = stepDuel(duel, [[], []]);
  assert.ok(step.done);
  assert.equal(seat(duel, CORNER.corneredSeat).outcome, 'won');
  assert.equal(seat(duel, CORNER.casterSeat).outcome, 'timeout');
  assert.ok((step.rewards[CORNER.corneredSeat] ?? 0) > REWARD.win - 1);
  assert.ok((step.rewards[CORNER.casterSeat] ?? 0) <= 0);
});

void test('a cornered hero that stays in its corner runs out of drill time long before an ordinary duel would end, and both seats pay the stalemate', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: 8, jitter: 0, corner: true });
  let rewards: readonly number[] = [];
  while (duelRunning(duel)) rewards = stepDuel(duel, [[], []]).rewards;
  assert.equal(seat(duel, CORNER.corneredSeat).outcome, 'timeout');
  assert.ok(duel.world.time - duel.start < DUEL.timeLimit);
  assert.ok(duel.world.time - duel.start >= CORNER.timeLimit);
  assert.ok((rewards[CORNER.corneredSeat] ?? 0) <= -DUEL.stalemate);
});

void test('a cornered hero that runs from the fight loses the drill as if it had fallen', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: 7, jitter: 0, corner: true });
  const start = must(duel.corner, 'corner');
  const cornered: PlayerState = seat(duel, CORNER.corneredSeat).hero;
  const away = { x: start.corner.x - start.caster.x, z: start.corner.z - start.caster.z };
  const length: number = Math.hypot(away.x, away.z);
  const reach: number = length + CORNER.flee + 1;
  cornered.pos = { x: start.caster.x + (away.x / length) * reach, z: start.caster.z + (away.z / length) * reach };
  assert.ok(cornerRunAway(duel));
  const step = stepDuel(duel, [[], []]);
  assert.ok(step.done);
  assert.equal(seat(duel, CORNER.corneredSeat).outcome, 'died');
  assert.ok((step.rewards[CORNER.corneredSeat] ?? 0) <= -REWARD.death);
});

void test('a duel that is not asked for a corner starts as before', (): void => {
  const plain: Duel = createDuel(CONTENT, { seed: 11, jitter: 0.2 });
  const unasked: Duel = createDuel(CONTENT, { seed: 11, jitter: 0.2, corner: false });
  assert.equal(plain.corner, null);
  assert.deepEqual(seat(plain, 1).hero.pos, seat(unasked, 1).hero.pos);
  assert.deepEqual(plain.world.player.bar, unasked.world.player.bar);
});

void test('a corner duel replays from its record, corner and all', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: 5, jitter: 0, corner: true });
  const actions: number[][][] = [[], []];
  for (let decision: number = 0; decision < CORNERS.decisions; decision += 1) {
    const seen: Observation = duelObservation(duel, seat(duel, CORNER.casterSeat));
    const action: Action = forcedAction(seen.mask);
    actions[0]?.push([action.move, action.skill, action.target, action.use]);
    actions[1]?.push([1, 0, 0, 0]);
    const other: Observation = duelObservation(duel, seat(duel, CORNER.corneredSeat));
    stepDuel(duel, [commandsFor(duel.world, action, seen.view), commandsFor(duel.world, { move: 1, skill: 0, target: 0, use: 0 }, other.view)]);
  }
  const replay: DuelReplay = readDuelReplay(JSON.parse(JSON.stringify(recordDuelReplay(duel, actions, 'corner'))));
  assert.equal(replay.options.corner, true);
  const again: Duel = replayDuel(CONTENT, replay);
  assert.deepEqual(seat(again, 1).hero.pos, seat(duel, 1).hero.pos);
  assert.equal(seat(again, 1).hero.life, seat(duel, 1).hero.life);
});
