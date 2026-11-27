import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { facingOf } from '../math.ts';
import { spawnPacks } from '../world/monsters.ts';
import type { Command, PlayerState } from '../world/types.ts';
import { must } from '../../test/support.ts';
import { commandsFor } from './act.ts';
import type { Bystander } from './bystanders.ts';
import { MOVE_CHOICES, RL, SELF_FEATURES, SKILL_CHOICES, USE_CHOICES } from './contract.ts';
import type { Gather, GatherGoal, GatherGoalKind, GatherOptions, GatherStep } from './gather.ts';
import { createGather, courseObjective, facingPairs, GATHER, gatherObservation, gatherRunning, gatherZones, goalPoint, segmentsCross, settledAt, stepGather, walkingMask } from './gather.ts';
import { moveBucket } from './moves.ts';
import type { Observation } from './observe.ts';
import { REWARD } from './reward.ts';

const CONTENT: Content = loadContent();
const SEEDS: readonly number[] = Array.from({ length: 12 }, (_unused: unknown, index: number): number => index + 1);
const PLAY = { decisions: 600, near: 0.3, meetStop: 1.75 } as const;

function gap(from: Vec2, to: Vec2): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

function lone(goal: GatherGoalKind, seed: number, crowd: number = 0): Gather {
  return createGather(CONTENT, { seed, zone: GATHER.hideout, goal, crowd });
}

function walkerCommands(gather: Gather): Command[] {
  const seen: Observation = gatherObservation(gather);
  const aim: Vec2 | null = courseObjective(gather.world, gather.hero, gather.course);
  const person: Vec2 | null = gather.course.goal.kind === 'meet' ? goalPoint(gather.world, gather.course.goal) : null;
  const stopAt: number = person !== null && aim?.x === person.x && aim.z === person.z ? PLAY.meetStop : PLAY.near;
  const go: boolean = aim !== null && gap(gather.hero.pos, aim) > stopAt;
  const move: number = aim !== null && go ? moveBucket({ x: aim.x - gather.hero.pos.x, z: aim.z - gather.hero.pos.z }) : 0;
  return commandsFor(gather.world, { move, skill: 0, target: 0, use: 0 }, seen.view);
}

function playOut(gather: Gather, commands: (played: Gather) => Command[]): number {
  let total: number = 0;
  for (let decision: number = 0; decision < PLAY.decisions && gatherRunning(gather); decision += 1) total += stepGather(gather, commands(gather)).reward;
  return total;
}

function stillOne(goal: GatherGoalKind, crowd: number, wanted: (bystanders: readonly Bystander[]) => boolean): Gather {
  for (const seed of Array.from({ length: 80 }, (_unused: unknown, index: number): number => index + 100)) {
    const gather: Gather = lone(goal, seed, crowd);
    if (wanted(gather.crowd)) return gather;
  }
  throw new Error('no seed gave the wanted crowd');
}

function standing(bystanders: readonly Bystander[]): boolean {
  return bystanders.length > 0 && bystanders.every((one: Bystander): boolean => one.errand.kind === 'still' || one.errand.kind === 'talk');
}

function feature(seen: Observation, name: string): number {
  return seen.obs[SELF_FEATURES.indexOf(name)] ?? Number.NaN;
}

void test('gathers are played on open zones without duels, void or timed scenes, the Hideout among them', (): void => {
  const zones: ZoneDef[] = gatherZones(CONTENT);
  assert.ok(zones.some((zone: ZoneDef): boolean => zone.id === GATHER.hideout));
  assert.ok(zones.every((zone: ZoneDef): boolean => zone.duel === null && zone.void === null && zone.flash === null));
  const played: Gather[] = SEEDS.map((seed: number): Gather => createGather(CONTENT, { seed }));
  assert.ok(played.some((gather: Gather): boolean => gather.zone === GATHER.hideout));
  assert.ok(played.every((gather: Gather): boolean => gather.world.monsters.length === 0));
  const hall: Gather = createGather(CONTENT, { seed: 9, zone: 'hall_of_time' });
  const pack = must(hall.world.zone.packs[0], 'Hall pack');
  hall.hero.pos = { x: pack.x, z: pack.z };
  stepGather(hall, []);
  spawnPacks(hall.world);
  assert.equal(hall.world.monsters.length, 0);
});

void test('the same seed lays out the same gather', (): void => {
  const options: GatherOptions = { seed: 31 };
  const first: Gather = createGather(CONTENT, options);
  const again: Gather = createGather(CONTENT, options);
  assert.equal(again.zone, first.zone);
  assert.deepEqual(again.hero.pos, first.hero.pos);
  assert.deepEqual(again.course.goal, first.course.goal);
  assert.deepEqual(again.crowd.map((one: Bystander): Vec2 => one.hero.pos), first.crowd.map((one: Bystander): Vec2 => one.hero.pos));
});

void test('the hero walks at a walking pace drawn for the gather', (): void => {
  for (const seed of SEEDS) {
    const gather: Gather = lone('spot', seed);
    assert.ok(gather.pace >= GATHER.pace.min && gather.pace <= GATHER.pace.max);
    assert.equal(gather.hero.stats.moveSpeed, gather.pace);
  }
  const gather: Gather = lone('spot', 5);
  const from: Vec2 = { ...gather.hero.pos };
  const decisions: number = 6;
  for (let decision: number = 0; decision < decisions; decision += 1) stepGather(gather, walkerCommands(gather));
  const speed: number = gap(from, gather.hero.pos) / (decisions * RL.ticksPerDecision * RL.tick);
  assert.ok(speed <= gather.pace * 1.05 && speed >= gather.pace * 0.7, `walked at ${speed} for a pace of ${gather.pace}`);
});

void test('bystanders are one to eight allies in the hero party', (): void => {
  for (const seed of SEEDS) {
    const gather: Gather = createGather(CONTENT, { seed });
    assert.ok(gather.crowd.length >= GATHER.crowd.min && gather.crowd.length <= GATHER.crowd.max, `${gather.crowd.length} bystanders`);
    assert.ok(gather.crowd.every((one: Bystander): boolean => one.hero.party === gather.hero.party && gather.world.heroes.includes(one.hero)));
  }
});

void test('walking to the spot and stopping there wins', (): void => {
  const gather: Gather = lone('spot', 3);
  const total: number = playOut(gather, walkerCommands);
  assert.equal(gather.outcome, 'won');
  assert.ok(total > REWARD.win * 0.9);
  assert.ok(gap(gather.hero.pos, must(goalPoint(gather.world, gather.course.goal), 'the spot')) <= GATHER.arrive);
});

void test('a gather that never arrives runs out of time', (): void => {
  const gather: Gather = lone('spot', 4);
  playOut(gather, (): Command[] => []);
  assert.equal(gather.outcome, 'timeout');
});

void test('meeting a person is done only at a comfortable distance, still and facing them', (): void => {
  const gather: Gather = lone('meet', 8, 1);
  const person: Vec2 = must(goalPoint(gather.world, gather.course.goal), 'the person');
  const hero: PlayerState = gather.hero;
  const at = (distance: number, turned: number): boolean => {
    hero.pos = { x: person.x + distance, z: person.z };
    hero.facing = facingOf({ x: -1, z: 0 }) + turned;
    hero.moving = false;
    return settledAt(gather.world, hero, gather.course.goal);
  };
  assert.equal(at(1.75, 0), true);
  assert.equal(at(2.1, 0.3), true);
  assert.equal(at(1, 0), false);
  assert.equal(at(3, 0), false);
  assert.equal(at(1.75, Math.PI / 2), false);
  at(1.75, 0);
  hero.moving = true;
  assert.equal(settledAt(gather.world, hero, gather.course.goal), false);
});

void test('a walker that stops short of the person meets them', (): void => {
  const gather: Gather = lone('meet', 9, 1);
  playOut(gather, walkerCommands);
  assert.equal(gather.outcome, 'won');
});

void test('standing means staying put and facing the point', (): void => {
  const gather: Gather = stillOne('face', 0, (): boolean => true);
  const goal: GatherGoal = gather.course.goal;
  if (goal.kind !== 'face') assert.fail(`a ${goal.kind} goal where a face goal was asked for`);
  const hero: PlayerState = gather.hero;
  const looking: Vec2 = goal.at ?? { x: hero.pos.x, z: hero.pos.z + 1 };
  hero.facing = facingOf({ x: looking.x - hero.pos.x, z: looking.z - hero.pos.z });
  assert.equal(settledAt(gather.world, hero, goal), true);
  if (goal.at !== null) {
    hero.facing += Math.PI;
    assert.equal(settledAt(gather.world, hero, goal), false);
    hero.facing -= Math.PI;
  }
  hero.pos = { x: goal.spot.x + GATHER.standReach * 2, z: goal.spot.z };
  assert.equal(settledAt(gather.world, hero, goal), false);
});

interface Cost {
  readonly reward: number;
  readonly gather: Gather;
}

function costAt(edge: number): Cost {
  const gather: Gather = stillOne('spot', 1, standing);
  const other: PlayerState = must(gather.crowd[0], 'the bystander').hero;
  other.pos = { x: gather.hero.pos.x + gather.hero.radius + other.radius + edge, z: gather.hero.pos.z };
  const step: GatherStep = stepGather(gather, []);
  return { reward: step.reward, gather };
}

void test('coming into personal space costs more the closer he is, and touching costs most', (): void => {
  const far: Cost = costAt(GATHER.space + 1);
  const near: Cost = costAt(GATHER.space / 2);
  const touching: Cost = costAt(0);
  assert.ok(near.reward < far.reward);
  assert.ok(touching.reward < near.reward);
  assert.equal(far.gather.tally.intrusions, 0);
  assert.equal(near.gather.tally.intrusions, 1);
  assert.equal(near.gather.tally.contacts, 0);
  assert.equal(touching.gather.tally.contacts, 1);
});

void test('two people facing each other make a pair, and a line between them is crossed', (): void => {
  const gather: Gather = stillOne('spot', 2, standing);
  const [first, second] = gather.crowd.map((one: Bystander): PlayerState => one.hero);
  const a: PlayerState = must(first, 'the first');
  const b: PlayerState = must(second, 'the second');
  const middle: Vec2 = { x: gather.hero.pos.x + 4, z: gather.hero.pos.z };
  a.pos = { x: middle.x, z: middle.z - 1 };
  b.pos = { x: middle.x, z: middle.z + 1 };
  a.facing = facingOf({ x: 0, z: 1 });
  b.facing = facingOf({ x: 0, z: -1 });
  assert.equal(facingPairs([a, b]).length, 1);
  b.facing = facingOf({ x: 1, z: 0 });
  assert.equal(facingPairs([a, b]).length, 0);
  b.facing = facingOf({ x: 0, z: -1 });
  assert.equal(segmentsCross({ x: middle.x - 1, z: middle.z }, { x: middle.x + 1, z: middle.z }, a.pos, b.pos), true);
  assert.equal(segmentsCross({ x: middle.x - 1, z: middle.z + 3 }, { x: middle.x + 1, z: middle.z + 3 }, a.pos, b.pos), false);
  gather.from = { x: middle.x - 1, z: middle.z };
  gather.hero.pos = { x: middle.x + 0.8, z: middle.z };
  stepGather(gather, []);
  assert.equal(gather.tally.crossings, 1);
});

void test('turning back and forth is charged as jitter, a steady turn is not', (): void => {
  const gather: Gather = lone('spot', 6);
  const base: number = gather.hero.facing;
  for (const turned of [0.6, -0.6, 0.6, -0.6]) {
    gather.hero.facing = base + turned;
    stepGather(gather, []);
  }
  assert.ok(gather.tally.jitters >= 2);
  const steady: Gather = lone('spot', 6);
  for (const turned of [0.6, 1.2, 1.8, 2.4]) {
    steady.hero.facing = base + turned;
    stepGather(steady, []);
  }
  assert.equal(steady.tally.jitters, 0);
});

void test('a gather reads as a roam and leaves only moves to choose', (): void => {
  const gather: Gather = createGather(CONTENT, { seed: 2 });
  const seen: Observation = gatherObservation(gather);
  assert.equal(RL.version, 8);
  assert.equal(feature(seen, 'situation_roam'), 1);
  assert.equal(feature(seen, 'objective_has'), gather.course.goal.kind === 'face' && gather.course.goal.at === null ? 0 : 1);
  for (let choice: number = 1; choice < SKILL_CHOICES; choice += 1) assert.equal(seen.mask[MOVE_CHOICES + choice], 0);
  for (let choice: number = 1; choice < USE_CHOICES; choice += 1) assert.equal(seen.mask[MOVE_CHOICES + SKILL_CHOICES + RL.targets + choice], 0);
  assert.ok(Array.from({ length: MOVE_CHOICES }, (_unused: unknown, index: number): number => seen.mask[index] ?? 0).some((open: number): boolean => open === 1));
  const all: Uint8Array = walkingMask(new Uint8Array(seen.mask.length).fill(1));
  assert.equal(all.reduce((sum: number, open: number): number => sum + open, 0), MOVE_CHOICES + 1 + RL.targets + 1);
});
