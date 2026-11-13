import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MotionSample, TestScene } from '../../test/motion-support.ts';
import { MOTION_DT, motionProblems, placedProp, sampleOf, sceneZone } from '../../test/motion-support.ts';
import { SCENE_BASE } from '../../test/road-support.ts';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef, ZoneExit } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance, facingOf } from '../math.ts';
import { blockerGap, buildNavGrid, isWalkable, moveWithCollision, nearestWalkable, paceAt, propBlockers } from '../nav/grid.ts';
import type { Blocker, NavGrid } from '../nav/grid.ts';
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

const PILE: Vec2 = { x: 14, z: 13 };

const EXIT_WALK = {
  start: 6,
  beyond: 12,
  seconds: 8,
  aside: 0.9,
  sides: [-1, 0, 1],
  reached: 1.5,
} as const;

for (const side of [{ name: 'south', x: 0, z: 1 }, { name: 'north', x: 0, z: -1 }, { name: 'east', x: 1, z: 0 }, { name: 'west', x: -1, z: 0 }] as const) {
  void test(`holding the button on a rock pile from the ${side.name} walks straight at its near face and stops there, never round to the far side`, (): void => {
    const start: Vec2 = { x: PILE.x + side.x * 10, z: PILE.z + side.z * 10 };
    const scene: HeroScene = { name: `holding the button on a rock pile from the ${side.name}`, tiles: ['.......', '.......', '.......', '.......', '.......', '.......', '.......'], props: [placedProp('castle_rubble_large', PILE.x, PILE.z)], start, dest: PILE, held: true };
    const { world, samples } = walk(scene);
    assert.deepEqual(motionProblems('hero', samples, LIMITS.turnRate), []);
    const along = (pos: Vec2): number => (pos.x - PILE.x) * side.x + (pos.z - PILE.z) * side.z;
    const across = (pos: Vec2): number => Math.abs((pos.x - PILE.x) * side.z - (pos.z - PILE.z) * side.x);
    assert.ok(samples.every((sample: MotionSample): boolean => along(sample.pos) > 0 && across(sample.pos) < 1), `the hero left the straight line toward the pile from the ${side.name}`);
    const face: number = Math.min(...samples.map((sample: MotionSample): number => along(sample.pos)));
    assert.ok(along(world.player.pos) - face < LIMITS.arrival, 'the hero did not stay at the near face');
    assert.ok(face < 6, `the hero stopped ${face.toFixed(2)} m from the pile's middle, short of its face`);
  });
}

for (const zone of content.zones.values()) {
  for (const exit of zone.exits) {
    for (const side of zone.kind === 'void' ? [0] : EXIT_WALK.sides) {
      void test(`holding the button beyond ${zone.id}'s ${exit.id} exit, ${side === 0 ? 'through its middle' : 'past the edge of its trigger'}${side < 0 ? ' on the left' : side > 0 ? ' on the right' : ''}, walks up to it without stopping short and never travels`, (): void => {
        const world: World = worldIn(content, zone.id, 5);
        world.zone = { ...world.zone, exits: world.zone.exits.map((each: ZoneExit): ZoneExit => ({ ...each, requires: [] })) };
        world.monsters = [];
        world.wake = null;
        stepWorld(world, [], MOTION_DT);
        const live: ZoneExit = must(world.zone.exits.find((each: ZoneExit): boolean => each.id === exit.id), 'live exit');
        const middle: Vec2 = { x: ((zone.tiles[0]?.length ?? 0) * zone.cellSize) / 2, z: (zone.tiles.length * zone.cellSize) / 2 };
        const span: number = Math.max(1e-9, distance(middle, live));
        const inward: Vec2 = { x: (middle.x - live.x) / span, z: (middle.z - live.z) / span };
        const aside: number = side * (live.radius + EXIT_WALK.aside);
        const across: Vec2 = { x: live.x - inward.z * aside, z: live.z + inward.x * aside };
        const start: Vec2 = must(nearestWalkable(world.grid, { x: across.x + inward.x * (live.radius + EXIT_WALK.start), z: across.z + inward.z * (live.radius + EXIT_WALK.start) }, EXIT_WALK.start), 'start');
        world.player.pos = { ...start };
        world.trail = { ...start };
        const dest: Vec2 = { x: across.x - inward.x * EXIT_WALK.beyond, z: across.z - inward.z * EXIT_WALK.beyond };
        const shifted: Vec2 = { ...world.shift };
        for (let step: number = 0; step < Math.round(EXIT_WALK.seconds / MOTION_DT) && world.zone.id === zone.id; step += 1) {
          const held: Vec2 = { x: dest.x + world.shift.x - shifted.x, z: dest.z + world.shift.z - shifted.z };
          stepWorld(world, [{ type: 'move', dest: held, held: true }], MOTION_DT);
        }
        assert.equal(world.zone.id, zone.id);
        const reach: number = zone.kind === 'void' ? 0 : distance(world.player.pos, live) - live.radius - Math.abs(aside);
        assert.ok(reach <= EXIT_WALK.reached, `the hero stopped ${reach.toFixed(1)} m short, at (${world.player.pos.x.toFixed(1)}, ${world.player.pos.z.toFixed(1)})`);
      });
    }
  }
}

for (const zone of content.zones.values()) {
  for (const exit of zone.exits) {
    void test(`holding the button on the glow just outside ${zone.id}'s ${exit.id} trigger walks to it without travelling, and a click on the exit then travels`, (): void => {
      const world: World = worldIn(content, zone.id, 5);
      world.zone = { ...world.zone, exits: world.zone.exits.map((each: ZoneExit): ZoneExit => ({ ...each, requires: [] })) };
      world.monsters = [];
      world.wake = null;
      stepWorld(world, [], MOTION_DT);
      const live: ZoneExit = must(world.zone.exits.find((each: ZoneExit): boolean => each.id === exit.id), 'live exit');
      const middle: Vec2 = { x: ((zone.tiles[0]?.length ?? 0) * zone.cellSize) / 2, z: (zone.tiles.length * zone.cellSize) / 2 };
      const span: number = Math.max(1e-9, distance(middle, live));
      const inward: Vec2 = { x: (middle.x - live.x) / span, z: (middle.z - live.z) / span };
      const start: Vec2 = must(nearestWalkable(world.grid, { x: live.x + inward.x * (live.radius + EXIT_WALK.start), z: live.z + inward.z * (live.radius + EXIT_WALK.start) }, EXIT_WALK.start), 'start');
      world.player.pos = { ...start };
      world.trail = { ...start };
      const glow: Vec2 = { x: live.x + inward.x * (live.radius + EXIT_WALK.aside), z: live.z + inward.z * (live.radius + EXIT_WALK.aside) };
      const shifted: Vec2 = { ...world.shift };
      for (let step: number = 0; step < Math.round(EXIT_WALK.seconds / MOTION_DT) && world.zone.id === zone.id; step += 1) {
        const held: Vec2 = { x: glow.x + world.shift.x - shifted.x, z: glow.z + world.shift.z - shifted.z };
        stepWorld(world, [{ type: 'move', dest: held, held: true }], MOTION_DT);
      }
      assert.equal(world.zone.id, zone.id);
      stepWorld(world, [{ type: 'travel', exit: exit.id }], MOTION_DT);
      for (let step: number = 0; step < Math.round(EXIT_WALK.seconds / MOTION_DT) && world.zone.id === zone.id; step += 1) stepWorld(world, [], MOTION_DT);
      assert.equal(world.zone.id, exit.to, `the click left the hero at (${world.player.pos.x.toFixed(1)}, ${world.player.pos.z.toFixed(1)})`);
    });
  }
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

const FACE = {
  at: { x: 14, z: 14 },
  start: 10,
  seconds: 6,
  reach: 0.3,
  turnSeconds: 1,
  turnSlack: 0.2,
  slideStep: 0.02,
  slideSteps: 150,
  slideKeep: 0.9,
  normalStep: 0.005,
  slideAngle: Math.PI / 4,
} as const;

const FACE_PROPS: readonly { readonly prop: string; readonly rotationDegrees: number }[] = [
  { prop: 'castle_rubble_large', rotationDegrees: 0 },
  { prop: 'castle_wall_ruin', rotationDegrees: 0 },
  { prop: 'castle_pillar', rotationDegrees: 0 },
  { prop: 'crag_low', rotationDegrees: 0 },
  { prop: 'crag_b', rotationDegrees: 0 },
  { prop: 'crag_b', rotationDegrees: 40 },
  { prop: 'crag_spire', rotationDegrees: 115 },
];

const SIDES = [{ name: 'south', x: 0, z: 1 }, { name: 'north', x: 0, z: -1 }, { name: 'east', x: 1, z: 0 }, { name: 'west', x: -1, z: 0 }] as const;

function faceScene(prop: string, rotationDegrees: number, start: Vec2): World {
  const world: World = worldIn(content, content.world.start, 5);
  const tiles: readonly string[] = ['.......', '.......', '.......', '.......', '.......', '.......', '.......'];
  enterZone(world, sceneZone(base, `test_face_${prop}`, { tiles, props: [{ ...placedProp(prop, FACE.at.x, FACE.at.z), rotationDegrees }], start }), { type: 'start' });
  world.monsters = [];
  return world;
}

function gapTo(prop: string, rotationDegrees: number, pos: Vec2): number {
  const blockers: Blocker[] = propBlockers(must(content.props.get(prop), prop), FACE.at.x, FACE.at.z, rotationDegrees);
  return Math.min(...blockers.map((blocker: Blocker): number => blockerGap(blocker, pos.x, pos.z)));
}

function outward(prop: string, rotationDegrees: number, pos: Vec2): Vec2 {
  const gx: number = gapTo(prop, rotationDegrees, { x: pos.x + FACE.normalStep, z: pos.z }) - gapTo(prop, rotationDegrees, { x: pos.x - FACE.normalStep, z: pos.z });
  const gz: number = gapTo(prop, rotationDegrees, { x: pos.x, z: pos.z + FACE.normalStep }) - gapTo(prop, rotationDegrees, { x: pos.x, z: pos.z - FACE.normalStep });
  const length: number = Math.max(1e-9, Math.hypot(gx, gz));
  return { x: gx / length, z: gz / length };
}

function rotated(direction: Vec2, angle: number): Vec2 {
  return { x: direction.x * Math.cos(angle) - direction.z * Math.sin(angle), z: direction.x * Math.sin(angle) + direction.z * Math.cos(angle) };
}

function turnGap(a: number, b: number): number {
  const delta: number = Math.abs((((b - a) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
  return delta;
}

for (const { prop, rotationDegrees } of FACE_PROPS) {
  for (const side of SIDES) {
    void test(`holding the button on ${prop} turned ${rotationDegrees} degrees from the ${side.name} brings his body within ${FACE.reach} m of its base, never into it, and he keeps turning to the pointer there`, (): void => {
      const radius: number = content.player.radius;
      const world: World = faceScene(prop, rotationDegrees, { x: FACE.at.x + side.x * FACE.start, z: FACE.at.z + side.z * FACE.start });
      for (let step: number = 0; step < Math.round(FACE.seconds / MOTION_DT); step += 1) {
        stepWorld(world, [{ type: 'move', dest: FACE.at, held: true }], MOTION_DT);
        assert.ok(gapTo(prop, rotationDegrees, world.player.pos) >= radius - 1e-6, `his body entered ${prop} at (${world.player.pos.x.toFixed(2)}, ${world.player.pos.z.toFixed(2)})`);
      }
      const gap: number = gapTo(prop, rotationDegrees, world.player.pos);
      assert.ok(gap <= radius + FACE.reach, `he stopped with his body ${(gap - radius).toFixed(2)} m from ${prop}'s base`);
      const toward: number = facingOf({ x: FACE.at.x - world.player.pos.x, z: FACE.at.z - world.player.pos.z });
      world.player.facing = toward + Math.PI;
      for (let step: number = 0; step < Math.round(FACE.turnSeconds / MOTION_DT); step += 1) {
        stepWorld(world, [{ type: 'move', dest: FACE.at, held: true }], MOTION_DT);
      }
      assert.ok(turnGap(world.player.facing, facingOf({ x: FACE.at.x - world.player.pos.x, z: FACE.at.z - world.player.pos.z })) <= FACE.turnSlack, 'a held pointer inside the prop did not turn him to face it');
    });
  }
}

for (const { prop, rotationDegrees } of FACE_PROPS) {
  void test(`pressing diagonally into ${prop} turned ${rotationDegrees} degrees slides him along its face at most of his pace, from every side`, (): void => {
    const radius: number = content.player.radius;
    const world: World = faceScene(prop, rotationDegrees, { x: 2, z: 2 });
    const navGrid: NavGrid = buildNavGrid(world.zone, content.props, content.surfaces, radius);
    for (const side of SIDES) {
      for (const turn of [-1, 1]) {
        const pos: Vec2 = { x: FACE.at.x + side.x * FACE.start, z: FACE.at.z + side.z * FACE.start };
        while (gapTo(prop, rotationDegrees, pos) > radius + FACE.slideStep) moveWithCollision(navGrid, pos, -side.x * FACE.slideStep, -side.z * FACE.slideStep);
        const into: Vec2 = rotated(outward(prop, rotationDegrees, pos), Math.PI - FACE.slideAngle * turn);
        let travelled: number = 0;
        let allowed: number = 0;
        for (let step: number = 0; step < FACE.slideSteps; step += 1) {
          const normal: Vec2 = outward(prop, rotationDegrees, pos);
          const pushIn: number = Math.min(0, into.x * normal.x + into.z * normal.z);
          allowed += Math.hypot(into.x - normal.x * pushIn, into.z - normal.z * pushIn) * FACE.slideStep;
          const before: Vec2 = { ...pos };
          moveWithCollision(navGrid, pos, into.x * FACE.slideStep, into.z * FACE.slideStep);
          travelled += distance(before, pos);
          assert.ok(gapTo(prop, rotationDegrees, pos) >= radius - 1e-6, `sliding pushed his body into ${prop}`);
        }
        assert.ok(travelled >= allowed * FACE.slideKeep, `pressing into ${prop} from the ${side.name} ${turn < 0 ? 'leftward' : 'rightward'} slid ${travelled.toFixed(2)} m of the ${allowed.toFixed(2)} m its faces allow`);
      }
    }
  });
}

const RUIN = {
  at: { x: 66.5, z: 14 },
  starts: [
    { name: 'north, at the floor edge', x: 66.5, z: 9.8 },
    { name: 'south', x: 66.5, z: 18 },
    { name: 'west', x: 61, z: 14 },
    { name: 'east', x: 71.2, z: 14 },
  ],
} as const;

for (const start of RUIN.starts) {
  void test(`holding the button on the Hall's wall ruin from the ${start.name} walks him to its base, even from ground the floor edge hems in`, (): void => {
    const world: World = worldIn(content, 'hall_of_time', 5);
    world.monsters = [];
    world.player.pos = { x: start.x, z: start.z };
    world.trail = { x: start.x, z: start.z };
    for (let step: number = 0; step < Math.round(FACE.seconds / MOTION_DT); step += 1) stepWorld(world, [{ type: 'move', dest: RUIN.at, held: true }], MOTION_DT);
    const placed = must(world.zone.props.find((prop): boolean => prop.prop === 'castle_wall_ruin' && prop.x === RUIN.at.x && prop.z === RUIN.at.z), 'wall ruin');
    const gap: number = Math.min(...propBlockers(must(content.props.get(placed.prop), placed.prop), placed.x, placed.z, placed.rotationDegrees).map((blocker: Blocker): number => blockerGap(blocker, world.player.pos.x, world.player.pos.z)));
    const radius: number = content.player.radius;
    assert.ok(gap <= radius + FACE.reach, `he stopped with his body ${(gap - radius).toFixed(2)} m from the wall ruin`);
    assert.ok(gap >= radius - 0.02, 'he walked into the wall ruin');
  });
}
