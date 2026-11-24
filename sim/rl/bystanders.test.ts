import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { facingOf } from '../math.ts';
import { isWalkable } from '../nav/grid.ts';
import { createRng } from '../rng.ts';
import { stepWorld } from '../world/step.ts';
import type { Command, PlayerState, World } from '../world/types.ts';
import { must } from '../../test/support.ts';
import type { Bystander, Crowd, CrowdPlan } from './bystanders.ts';
import { BYSTANDERS, bystanderBody, crowdCommands, placeCrowd } from './bystanders.ts';
import { RL } from './contract.ts';
import { GATHER, gatherWorld, readyGatherHero, turnBetween } from './gather.ts';

const CONTENT: Content = loadContent();
const HIDEOUT: ZoneDef = must(CONTENT.zones.get(GATHER.hideout), 'the Hideout');
const PLAN: CrowdPlan = { start: { x: 15.25, z: 21.25 }, goal: { x: 25, z: 21 }, heroPace: 1.6, count: 8, meet: false };

function gap(from: Vec2, to: Vec2): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

interface Moved {
  readonly one: Bystander;
  readonly farthest: number;
}

function hideout(seed: number): World {
  const world: World = gatherWorld(CONTENT, HIDEOUT, seed);
  readyGatherHero(world, createRng(seed), 1);
  world.player.pos = { ...PLAN.start };
  return world;
}

function run(world: World, crowd: readonly Bystander[], seconds: number): number[] {
  const starts: Vec2[] = crowd.map((one: Bystander): Vec2 => ({ ...one.hero.pos }));
  const farthest: number[] = crowd.map((): number => 0);
  const decisions: number = Math.round(seconds / (RL.tick * RL.ticksPerDecision));
  for (let decision: number = 0; decision < decisions; decision += 1) {
    const commands: Command[] = crowdCommands(world, crowd);
    for (let tick: number = 0; tick < RL.ticksPerDecision; tick += 1) stepWorld(world, tick === 0 ? commands : [], RL.tick);
    crowd.forEach((one: Bystander, index: number): void => {
      farthest[index] = Math.max(farthest[index] ?? 0, gap(one.hero.pos, starts[index] ?? one.hero.pos));
    });
  }
  return farthest;
}

void test('a body is an ally of the primary hero at the pace it is given', (): void => {
  const world: World = hideout(1);
  const body: PlayerState = bystanderBody(world, { x: 18, z: 21 }, 1, 1.4);
  assert.ok(world.heroes.includes(body));
  assert.notEqual(body.id, world.player.id);
  assert.equal(body.party, world.player.party);
  assert.equal(body.stats.moveSpeed, 1.4);
  assert.equal(body.facing, 1);
  const other: PlayerState = bystanderBody(world, { x: 19, z: 21 }, 0, 1);
  assert.notEqual(other.id, body.id);
  assert.notEqual(other.pos, body.pos);
});

void test('a crowd stands on walkable floor, apart from each other and clear of the start and the goal', (): void => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const world: World = hideout(seed);
    const crowd: Crowd = placeCrowd(world, createRng(seed), PLAN);
    assert.ok(crowd.bystanders.length >= 1 && crowd.bystanders.length <= PLAN.count);
    assert.equal(crowd.target, null);
    crowd.bystanders.forEach((one: Bystander, index: number): void => {
      assert.ok(isWalkable(world.grid, one.hero.pos.x, one.hero.pos.z));
      assert.ok(gap(one.hero.pos, PLAN.start) >= BYSTANDERS.startGap);
      assert.ok(gap(one.hero.pos, PLAN.goal) >= BYSTANDERS.startGap);
      for (const other of crowd.bystanders.slice(index + 1)) assert.ok(gap(one.hero.pos, other.hero.pos) >= BYSTANDERS.bodyGap - 1e-9);
    });
  }
});

void test('people in a talking group face the middle of their group', (): void => {
  const talkers: Bystander[] = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((seed: number): Bystander[] => placeCrowd(hideout(seed), createRng(seed), PLAN).bystanders.filter((one: Bystander): boolean => one.errand.kind === 'talk'));
  assert.ok(talkers.length > 0);
  for (const one of talkers) {
    if (one.errand.kind !== 'talk') continue;
    const centre: Vec2 = one.errand.centre;
    assert.ok(Math.abs(turnBetween(one.hero.facing, facingOf({ x: centre.x - one.hero.pos.x, z: centre.z - one.hero.pos.z }))) < 1e-6);
  }
});

void test('a meeting puts the person to meet at the goal', (): void => {
  const world: World = hideout(9);
  const crowd: Crowd = placeCrowd(world, createRng(9), { ...PLAN, meet: true, count: 3 });
  const target: PlayerState = must(crowd.target, 'the person to meet');
  assert.ok(gap(target.pos, PLAN.goal) <= BYSTANDERS.placeReach + 0.01);
  assert.ok(crowd.bystanders.some((one: Bystander): boolean => one.hero === target));
});

void test('crossers set off across the route and wanderers walk between their stops', (): void => {
  const moving: Moved[] = [];
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const world: World = hideout(seed);
    const crowd: Crowd = placeCrowd(world, createRng(seed), PLAN);
    const farthest: number[] = run(world, crowd.bystanders, 12);
    crowd.bystanders.forEach((one: Bystander, index: number): void => {
      if (one.errand.kind === 'still' || one.errand.kind === 'talk') return;
      moving.push({ one, farthest: farthest[index] ?? 0 });
      if (one.errand.kind === 'cross') assert.equal(one.errand.sent, true);
      else assert.ok(one.errand.next > 0, 'a wanderer kept to its first stop');
    });
  }
  const crossers: Moved[] = moving.filter((moved: Moved): boolean => moved.one.errand.kind === 'cross');
  const wanderers: Moved[] = moving.filter((moved: Moved): boolean => moved.one.errand.kind === 'wander');
  assert.ok(crossers.length > 0 && wanderers.length > 0);
  for (const kind of [crossers, wanderers]) assert.ok(kind.filter((moved: Moved): boolean => moved.farthest > 1).length * 2 > kind.length);
});
