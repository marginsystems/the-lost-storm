import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MotionSample, TestScene } from '../../test/motion-support.ts';
import { MOTION_DT, motionProblems, placedProp, sampleOf, sceneZone } from '../../test/motion-support.ts';
import { SCENE_BASE } from '../../test/road-support.ts';
import { worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { isWalkable, paceAt } from '../nav/grid.ts';
import { stepWorld } from './step.ts';
import type { Command, World } from './types.ts';
import { enterZone } from './zones.ts';

const content: Content = loadContent();
const base: ZoneDef = SCENE_BASE;

const LIMITS = {
  turnRate: 24.5,
  seconds: 8,
  arrival: 0.75,
} as const;

interface HeroScene extends TestScene {
  readonly name: string;
  readonly dest: Vec2;
  readonly held: boolean;
}

const SCENES: readonly HeroScene[] = [
  { name: 'around a wall corner', tiles: ['......', '......', '......', '...   ', '...   ', '...   '], props: [], start: { x: 20, z: 6 }, dest: { x: 6, z: 20 }, held: false },
  { name: 'past a pillar', tiles: ['.......', '.......', '.......', '.......', '.......', '.......', '.......'], props: [placedProp('mossy_pillar', 14, 14)], start: { x: 14, z: 22 }, dest: { x: 14, z: 5 }, held: false },
  { name: 'holding the button toward a wall', tiles: ['......', '......', '......', '...   ', '...   ', '...   '], props: [], start: { x: 6, z: 6 }, dest: { x: 18, z: 18 }, held: true },
];

function walk(scene: HeroScene): { world: World; samples: MotionSample[] } {
  const world: World = worldIn(content, content.world.start, 5);
  enterZone(world, sceneZone(base, `test_${scene.name}`, scene), { type: 'start' });
  world.monsters = [];
  const samples: MotionSample[] = [];
  for (let step: number = 0; step < Math.round(LIMITS.seconds / MOTION_DT); step += 1) {
    const commands: Command[] = step === 0 || scene.held ? [{ type: 'move', dest: scene.dest, held: scene.held }] : [];
    stepWorld(world, commands, MOTION_DT);
    samples.push(sampleOf(world.player, false));
  }
  return { world, samples };
}

for (const scene of SCENES) {
  void test(`the hero walks ${scene.name} without jitter`, (): void => {
    const { world, samples } = walk(scene);
    assert.deepEqual(motionProblems('hero', samples, LIMITS.turnRate), []);
    assert.ok(isWalkable(world.grid, world.player.pos.x, world.player.pos.z));
    assert.equal(world.player.moving, false);
    if (isWalkable(world.grid, scene.dest.x, scene.dest.z)) assert.ok(distance(world.player.pos, scene.dest) < LIMITS.arrival);
  });
}

const SWEEP = {
  tiles: 20,
  start: { x: 40, z: 40 },
  radius: 5,
  warmup: 1,
  seconds: 6,
  headingSlack: 1.5,
  headingFloor: 0.01,
  speedSpread: 0.03,
  slip: 0.02,
  maxTurnRate: 24.5,
  searchReads: 200,
} as const;

interface Sweep {
  readonly name: string;
  readonly offset: (seconds: number) => Vec2;
  readonly turnRate: number;
}

function circle(period: number): Sweep {
  const rate: number = (Math.PI * 2) / period;
  return { name: `a circle of one turn per ${period} s`, offset: (seconds: number): Vec2 => ({ x: Math.cos(seconds * rate) * SWEEP.radius, z: Math.sin(seconds * rate) * SWEEP.radius }), turnRate: rate };
}

interface SweepStep {
  readonly heading: number;
  readonly facing: number;
  readonly speed: number;
}

interface SweepRun {
  readonly steps: SweepStep[];
  readonly speed: number;
}

function sweep(pattern: Sweep): SweepRun {
  const world: World = worldIn(content, content.world.start, 5);
  const row: string = '.'.repeat(SWEEP.tiles);
  enterZone(world, sceneZone(base, 'test_sweep', { tiles: Array.from({ length: SWEEP.tiles }, (): string => row), props: [], start: SWEEP.start }), { type: 'start' });
  world.monsters = [];
  const steps: SweepStep[] = [];
  for (let step: number = 0; step < Math.round(SWEEP.seconds / MOTION_DT); step += 1) {
    const offset: Vec2 = pattern.offset(step * MOTION_DT);
    const from: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
    stepWorld(world, [{ type: 'move', held: step > 0, dest: { x: from.x + offset.x, z: from.z + offset.z } }], MOTION_DT);
    const dx: number = world.player.pos.x - from.x;
    const dz: number = world.player.pos.z - from.z;
    if (step * MOTION_DT >= SWEEP.warmup) steps.push({ heading: Math.atan2(dx, dz), facing: world.player.facing, speed: Math.hypot(dx, dz) / MOTION_DT });
  }
  return { steps, speed: world.player.stats.moveSpeed * paceAt(world.grid, world.player.pos.x, world.player.pos.z) };
}

function turnBetween(a: number, b: number): number {
  let delta: number = (b - a) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return Math.abs(delta);
}

for (const pattern of [circle(2), circle(1)]) {
  void test(`holding the button while the pointer sweeps ${pattern.name} steers the hero round smoothly at a steady speed`, (): void => {
    const { steps, speed } = sweep(pattern);
    const bound: number = pattern.turnRate * MOTION_DT * SWEEP.headingSlack + SWEEP.headingFloor;
    steps.forEach((entry: SweepStep, index: number): void => {
      const before: SweepStep | undefined = steps[index - 1];
      if (before !== undefined) assert.ok(turnBetween(before.heading, entry.heading) <= bound, `heading jumped ${turnBetween(before.heading, entry.heading).toFixed(3)} rad at step ${index}`);
      assert.ok(Math.abs(entry.speed - speed) <= speed * SWEEP.speedSpread, `speed ${entry.speed.toFixed(2)} at step ${index}`);
      assert.ok(turnBetween(entry.heading, entry.facing) <= SWEEP.slip, `slid sideways ${turnBetween(entry.heading, entry.facing).toFixed(3)} rad at step ${index}`);
    });
  });
}

const SHARP: readonly Sweep[] = [
  { name: 'a figure of eight', offset: (seconds: number): Vec2 => ({ x: Math.sin((seconds * Math.PI * 2) / 3) * SWEEP.radius, z: Math.sin((seconds * Math.PI * 4) / 3) * SWEEP.radius * 0.6 }), turnRate: 0 },
  { name: 'tight reversals', offset: (seconds: number): Vec2 => ({ x: Math.floor(seconds * 2) % 2 === 0 ? SWEEP.radius : -SWEEP.radius, z: 0 }), turnRate: 0 },
];

for (const pattern of SHARP) {
  void test(`holding the button through ${pattern.name} turns the hero at a capped rate and never outruns his speed`, (): void => {
    const { steps, speed } = sweep(pattern);
    steps.forEach((entry: SweepStep, index: number): void => {
      const before: SweepStep | undefined = steps[index - 1];
      if (before !== undefined) assert.ok(turnBetween(before.facing, entry.facing) <= SWEEP.maxTurnRate * MOTION_DT, `facing jumped ${turnBetween(before.facing, entry.facing).toFixed(3)} rad at step ${index}`);
      assert.ok(entry.speed <= speed * (1 + SWEEP.speedSpread), `speed ${entry.speed.toFixed(2)} at step ${index}`);
      if (entry.speed > speed * 0.5) assert.ok(turnBetween(entry.heading, entry.facing) <= SWEEP.slip, `slid sideways at step ${index}`);
    });
  });
}

void test('holding the button toward a spot he cannot reach searches for a route at the repath pace, not every frame', (): void => {
  const world: World = worldIn(content, content.world.start, 5);
  const tiles: readonly string[] = ['..  ..', '..  ..', '..  ..', '..  ..', '..  ..', '..  ..'];
  enterZone(world, sceneZone(base, 'test_cut_off', { tiles, props: [], start: { x: 4, z: 12 } }), { type: 'start' });
  world.monsters = [];
  let reads: number = 0;
  const walkable: Uint8Array = new Proxy(world.grid.walkable, {
    get(target: Uint8Array, key: string | symbol): unknown {
      if (typeof key === 'string' && /^\d+$/.test(key)) reads += 1;
      return Reflect.get(target, key);
    },
  });
  world.grid = { ...world.grid, walkable };
  const dest: Vec2 = { x: 21, z: 12 };
  let searches: number = 0;
  for (let step: number = 0; step < Math.round(1 / MOTION_DT); step += 1) {
    reads = 0;
    stepWorld(world, [{ type: 'move', held: step > 0, dest }], MOTION_DT);
    if (reads > SWEEP.searchReads) searches += 1;
  }
  assert.ok(searches >= 1 && searches <= 6, `searched ${searches} times in a second`);
});
