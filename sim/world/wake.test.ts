import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneExit } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { createWorld } from './create.ts';
import { shoreDepth } from './shore.ts';
import { stepWorld } from './step.ts';
import type { WakeStage } from './wake.ts';
import { beatAt, beatsBetween, wakeLength, wakeStage } from './wake.ts';
import type { Command, GroundItem, WakeBeat, WakeState, World, WorldEvent } from './types.ts';
import type { ZoneWake } from '../content/story-types.ts';
import { travelThrough } from './zones.ts';

const content: Content = loadContent();
const DT: number = 1 / 60;

const RETURN = {
  idle: 3,
  walkLimit: 20,
  lead: 6,
  armLimit: 60,
} as const;

function zoneId(world: World): string {
  return world.zone.id;
}

function exitOf(world: World, id: string): ZoneExit {
  return must(world.zone.exits.find((exit: ZoneExit): boolean => exit.id === id), `exit ${id}`);
}

function armedOnShore(): World {
  const world: World = createWorld(content, { seed: 5, save: null, opening: true });
  const wake: WakeState = must(world.wake, 'wake');
  for (let step: number = 0; step < Math.ceil(wakeLength(wake.plan) / DT) + 1; step += 1) stepWorld(world, [], DT);
  world.flags['first_choice'] = 'took_journal';
  world.flags['opening'] = 'read';
  stepWorld(world, [], DT);
  const heading: Vec2 = { x: world.heading.x, z: world.heading.z };
  let seconds: number = 0;
  while (world.player.equipped.weapon === null && seconds < RETURN.armLimit) {
    const blade: GroundItem | undefined = world.ground.find((ground: GroundItem): boolean => ground.find === 'blade');
    const dest: Vec2 = blade === undefined ? { x: world.player.pos.x + heading.x * RETURN.lead, z: world.player.pos.z + heading.z * RETURN.lead } : blade.pos;
    stepWorld(world, [{ type: 'move', held: true, dest }], DT);
    seconds += DT;
  }
  return world;
}

function backFromTheHall(): World {
  const world: World = armedOnShore();
  travelThrough(world, exitOf(world, 'into_the_hall'));
  assert.equal(world.zone.id, 'hall_of_time');
  travelThrough(world, exitOf(world, 'mist'));
  assert.equal(world.zone.id, 'between');
  return world;
}

void test('coming back from the Hall he stands on the black shore with his blade, and does not wake again', (): void => {
  const world: World = backFromTheHall();
  assert.equal(world.wake, null);
  assert.equal(world.player.equipped.weapon?.base, 'rusted_blade');
  assert.equal(shoreDepth(world), 1);
  const exit: ZoneExit = exitOf(world, 'into_the_hall');
  const facing: Vec2 = { x: Math.sin(world.player.facing), z: Math.cos(world.player.facing) };
  assert.ok(distance(world.player.pos, exit) > exit.radius);
  assert.ok((exit.x - world.player.pos.x) * facing.x + (exit.z - world.player.pos.z) * facing.z < 0);
});

void test('back on the shore he can stand still without being pulled into the Hall, and the light behind him leads back in', (): void => {
  const world: World = backFromTheHall();
  for (let step: number = 0; step < Math.round(RETURN.idle / DT); step += 1) stepWorld(world, [], DT);
  assert.equal(world.zone.id, 'between');
  const exit: ZoneExit = exitOf(world, 'into_the_hall');
  const toward = (): Command => ({ type: 'move', held: true, dest: { x: exit.x, z: exit.z } });
  let seconds: number = 0;
  while (zoneId(world) === 'between' && seconds < RETURN.walkLimit) {
    stepWorld(world, [toward()], DT);
    seconds += DT;
  }
  assert.equal(zoneId(world), 'hall_of_time');
});

void test('a new hero still wakes in the mist the first time', (): void => {
  const world: World = createWorld(content, { seed: 5, save: null, opening: true });
  assert.notEqual(world.wake, null);
  assert.equal(world.shore, null);
});

const PLAN: ZoneWake = { still: 2, stir: 1, rise: 4, front: 0.25, settle: 2, hurry: 1 };

void test('the wake lies still, stirs, rises and settles in order, each stage running from zero to one', (): void => {
  const at = (elapsed: number): WakeStage => wakeStage(PLAN, elapsed);
  assert.equal(wakeLength(PLAN), 9);
  assert.deepEqual(at(0), { phase: 'still', stir: 0, rise: 0, front: 0, settle: 0, through: 0 });
  assert.equal(at(1.99).phase, 'still');
  assert.equal(at(2.5).phase, 'stir');
  assert.equal(at(2.5).stir, 0.5);
  assert.equal(at(5).phase, 'rise');
  assert.equal(at(5).stir, 1);
  assert.equal(at(5).rise, 0.5);
  assert.equal(at(7.5).phase, 'settle');
  assert.equal(at(7.5).rise, 1);
  assert.equal(at(7.5).settle, 0.25);
  assert.equal(at(9).through, 1);
  assert.equal(at(20).settle, 1);
});

void test('the mist front starts a share of the way into the rise and spreads until he has settled', (): void => {
  assert.equal(beatAt(PLAN, 'front'), 4);
  assert.equal(wakeStage(PLAN, 4).front, 0);
  assert.equal(wakeStage(PLAN, 6.5).front, 0.5);
  assert.equal(wakeStage(PLAN, 9).front, 1);
});

void test('every stage only grows as time passes', (): void => {
  let last: WakeStage = wakeStage(PLAN, 0);
  for (let elapsed: number = 0; elapsed <= 10; elapsed += 0.05) {
    const now: WakeStage = wakeStage(PLAN, elapsed);
    for (const key of ['stir', 'rise', 'front', 'settle', 'through'] as const) assert.ok(now[key] >= last[key], `${key} at ${elapsed}`);
    last = now;
  }
});

void test('each beat is crossed exactly once however the time is sliced', (): void => {
  assert.deepEqual(beatsBetween(PLAN, 0, 10), ['stir', 'front', 'standing']);
  assert.deepEqual(beatsBetween(PLAN, 2, 4), ['front']);
  const crossed: WakeBeat[] = [];
  for (let elapsed: number = 0; elapsed < 10; elapsed += 0.1) crossed.push(...beatsBetween(PLAN, elapsed, elapsed + 0.1));
  assert.deepEqual(crossed, ['stir', 'front', 'standing']);
});

void test('a new hero sends stir, front and standing as he wakes, and takes orders only once he has settled', (): void => {
  const world: World = createWorld(content, { seed: 5, save: null, opening: true });
  const wake: WakeState = must(world.wake, 'wake');
  const beats: WakeBeat[] = [];
  const start: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  const away: Command = { type: 'move', held: true, dest: { x: start.x + 8, z: start.z } };
  const standing: number = beatAt(wake.plan, 'standing');
  for (let step: number = 0; step < Math.ceil(wakeLength(wake.plan) / DT) - 1; step += 1) {
    const events: WorldEvent[] = stepWorld(world, [], DT);
    for (const event of events) if (event.type === 'wake') beats.push(event.beat);
  }
  assert.deepEqual(beats, ['stir', 'front', 'standing']);
  assert.ok(standing < wakeLength(wake.plan));
  assert.equal(distance(world.player.pos, start), 0);
  for (let step: number = 0; step < 60; step += 1) stepWorld(world, [away], DT);
  assert.equal(world.wake, null);
  assert.ok(distance(world.player.pos, start) > 1);
});

function wokenWorld(): World {
  return createWorld(content, { seed: 9, save: null, opening: true });
}

function stepsUntilUp(world: World, commands: (step: number) => readonly Command[]): { readonly steps: number; readonly beats: WakeBeat[] } {
  const beats: WakeBeat[] = [];
  let steps: number = 0;
  while (world.wake !== null && steps < 2000) {
    for (const event of stepWorld(world, commands(steps), DT)) if (event.type === 'wake') beats.push(event.beat);
    steps += 1;
  }
  return { steps, beats };
}

void test('a click while he lies still does nothing; once he stirs it speeds the rest of the wake through within the hurry time, every beat still sent', (): void => {
  const world: World = wokenWorld();
  const wake: WakeState = must(world.wake, 'wake');
  const click: Command = { type: 'move', held: false, dest: { x: world.player.pos.x + 4, z: world.player.pos.z } };
  stepWorld(world, [click], DT);
  assert.equal(wake.rate, 1);
  const stirStep: number = Math.ceil(beatAt(wake.plan, 'stir') / DT) + 1;
  const { steps, beats } = stepsUntilUp(world, (step: number): readonly Command[] => (step === stirStep ? [click] : []));
  assert.deepEqual(beats, ['stir', 'front', 'standing']);
  assert.ok(steps * DT < stirStep * DT + wake.plan.hurry + 2 * DT);
});

void test('a hurried wake keeps time moving forward smoothly, never skipping a stage', (): void => {
  const world: World = wokenWorld();
  const wake: WakeState = must(world.wake, 'wake');
  const late: number = Math.ceil((beatAt(wake.plan, 'standing') - 0.5) / DT);
  let last: number = 0;
  stepsUntilUp(world, (step: number): readonly Command[] => {
    const now: number = world.wake?.elapsed ?? last;
    assert.ok(now - last <= DT * Math.max(1, wake.rate) + 1e-9);
    last = now;
    return step === late ? [{ type: 'skill', slot: 0, aim: world.player.pos, targetId: null }] : [];
  });
  assert.ok(wake.rate > 1);
});
