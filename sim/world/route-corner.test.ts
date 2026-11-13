import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { isWalkable, lineWalkable } from '../nav/grid.ts';
import { findPath } from '../nav/path.ts';
import { createWorld } from './create.ts';
import { clearMoments } from './moments.ts';
import type { ObjectiveTarget } from './objective.ts';
import { objectiveTarget } from './objective.ts';
import { startQuests } from './quests.ts';
import { ROUTE_CORNER, routeCorner } from './route-corner.ts';
import { pathLength } from './stick.ts';
import { stepWorld } from './step.ts';
import { setFlags } from './story.ts';
import type { Command, GroundItem, World } from './types.ts';
import { wakeLength } from './wake.ts';

const content: Content = loadContent();

const ARROW_WALK = {
  dt: 1 / 30,
  stick: 3.2,
  aimEvery: 0.25,
  lattice: 2,
  seeds: 8,
  slack: 1.6,
  grace: 3,
  stall: 0.5,
  still: 1e-3,
  armLimit: 60,
  lead: 6,
  exitClear: 1,
  edge: 0.3,
  quiet: 1e9,
} as const;

interface ArrowRun {
  readonly seconds: number;
  readonly stall: number;
  readonly arrived: boolean;
}

function pace(world: World): number {
  return world.player.stats.moveSpeed;
}

function holdAlongArrow(world: World, arrived: (world: World) => boolean, limit: number): ArrowRun {
  let aim: Vec2 | null = null;
  let sinceAim: number = Infinity;
  let still: number = 0;
  let stall: number = 0;
  let seconds: number = 0;
  for (; seconds < limit && !arrived(world); seconds += ARROW_WALK.dt) {
    const target: ObjectiveTarget | null = objectiveTarget(world);
    if (target === null) break;
    if (sinceAim >= ARROW_WALK.aimEvery) {
      aim = routeCorner(world, target.pos);
      sinceAim = 0;
    }
    sinceAim += ARROW_WALK.dt;
    const corner: Vec2 = aim ?? target.pos;
    const gap: number = Math.max(distance(corner, world.player.pos), ROUTE_CORNER.pass);
    const from: Vec2 = { ...world.player.pos };
    const command: Command = { type: 'walk', held: seconds > 0, dest: { x: from.x + ((corner.x - from.x) / gap) * ARROW_WALK.stick, z: from.z + ((corner.z - from.z) / gap) * ARROW_WALK.stick } };
    stepWorld(world, [command], ARROW_WALK.dt);
    still = distance(from, world.player.pos) < ARROW_WALK.still ? still + ARROW_WALK.dt : 0;
    stall = Math.max(stall, still);
  }
  return { seconds, stall, arrived: arrived(world) };
}

function onTheWay(zoneId: string, seed: number): World {
  const world: World = worldIn(content, zoneId, seed);
  world.quests['out_of_the_mist'] = 1;
  world.quests['the_first_taker'] = 1;
  setFlags(world, content.moments.cleared);
  startQuests(world);
  clearMoments(world);
  world.monsters = [];
  world.player.invulnerable = 1e9;
  return world;
}

function bound(world: World, goal: Vec2): number {
  return (pathLength(world.player.pos, findPath(world.grid, world.player.pos, goal)) / pace(world)) * ARROW_WALK.slack + ARROW_WALK.grace;
}

function left(zoneId: string): (world: World) => boolean {
  return (world: World): boolean => world.zone.id !== zoneId;
}

function standAt(world: World, at: Vec2): void {
  world.player.pos = { x: at.x, z: at.z };
  world.player.path = [];
  world.player.intent = { type: 'idle' };
  world.player.repathTimer = 0;
  world.player.queued = null;
  clearMoments(world);
  world.monsters = [];
  world.strikeTimer = ARROW_WALK.quiet;
}

void test('the next corner of the route is the goal when the way is open, and a bend round a prop when it is not', (): void => {
  const world: World = onTheWay('hall_of_time', 1);
  const goal: ObjectiveTarget = must(objectiveTarget(world), 'a target');
  world.player.pos = { x: 30, z: 26 };
  const corner: Vec2 = routeCorner(world, goal.pos);
  assert.ok(lineWalkable(world.grid, world.player.pos, corner), 'the corner is in a straight walkable line');
  assert.ok(distance(corner, world.player.pos) > ROUTE_CORNER.pass);
  assert.equal(lineWalkable(world.grid, world.player.pos, goal.pos), false, 'the straight line to the exit crosses a prop');
  assert.notDeepEqual(corner, goal.pos);
});

interface LatticeGoal {
  readonly kind: ObjectiveTarget['kind'];
  readonly arrived: (world: World, goal: ObjectiveTarget) => boolean;
}

function latticeFailures(zoneId: string, aim: LatticeGoal): string[] {
  const failures: string[] = [];
  const worlds: World[] = Array.from({ length: ARROW_WALK.seeds }, (_: unknown, index: number): World => onTheWay(zoneId, index + 1));
  const base: World = must(worlds[0], 'a world');
  const first: ObjectiveTarget = must(objectiveTarget(base), 'a target');
  assert.equal(first.kind, aim.kind);
  const width: number = base.grid.columns * base.grid.cellSize;
  const depth: number = base.grid.rows * base.grid.cellSize;
  let runs: number = 0;
  for (let x: number = ARROW_WALK.lattice; x < width; x += ARROW_WALK.lattice) {
    for (let z: number = ARROW_WALK.lattice; z < depth; z += ARROW_WALK.lattice) {
      const spot: Vec2 = { x, z };
      if (!isWalkable(base.grid, x, z) || distance(spot, first.pos) < first.radius + ARROW_WALK.exitClear || base.zone.exits.some((exit): boolean => distance(exit, spot) < exit.radius + ARROW_WALK.exitClear)) continue;
      const seed: number = 1 + (runs % ARROW_WALK.seeds);
      const world: World = must(worlds[seed - 1], `seed ${seed}`);
      runs += 1;
      standAt(world, spot);
      const goal: ObjectiveTarget = must(objectiveTarget(world), 'the target');
      const limit: number = bound(world, goal.pos);
      const run: ArrowRun = holdAlongArrow(world, (walker: World): boolean => aim.arrived(walker, goal), limit);
      if (!run.arrived || run.stall > ARROW_WALK.stall) failures.push(`seed ${seed} from (${x}, ${z}): ${run.arrived ? 'arrived' : `not there after ${limit.toFixed(1)} s, at (${world.player.pos.x.toFixed(1)}, ${world.player.pos.z.toFixed(1)})`}, stood still ${run.stall.toFixed(2)} s`);
    }
  }
  assert.ok(runs > 0);
  return failures;
}

void test('from every walkable Hall spot on a 2 m lattice, a stick held along the arrow reaches the east exit in time, on seeds 1 to 8', (): void => {
  assert.deepEqual(latticeFailures('hall_of_time', { kind: 'exit', arrived: (world: World, goal: ObjectiveTarget): boolean => distance(world.player.pos, goal.pos) < goal.radius + ARROW_WALK.edge }), []);
});

void test('from every walkable Hideout spot on a 2 m lattice, a stick held along the arrow reaches the fire in time, on seeds 1 to 8', (): void => {
  assert.deepEqual(latticeFailures('hideout', { kind: 'spot', arrived: (world: World, goal: ObjectiveTarget): boolean => distance(world.player.pos, goal.pos) < goal.radius }), []);
});

function armedOnShore(seed: number): World {
  const world: World = createWorld(content, { seed, save: null, opening: true });
  const plan = world.wake?.plan;
  if (plan !== undefined) for (let step: number = 0; step < Math.ceil(wakeLength(plan) / ARROW_WALK.dt) + 1; step += 1) stepWorld(world, [], ARROW_WALK.dt);
  world.flags['first_choice'] = 'took_journal';
  world.flags['opening'] = 'read';
  world.player.invulnerable = 1e9;
  for (let seconds: number = 0; world.player.equipped.weapon === null && seconds < ARROW_WALK.armLimit; seconds += ARROW_WALK.dt) {
    const blade: GroundItem | undefined = world.ground.find((ground: GroundItem): boolean => ground.find === 'blade');
    const command: Command = blade === undefined ? { type: 'move', held: true, dest: { x: world.player.pos.x + world.heading.x * ARROW_WALK.lead, z: world.player.pos.z + world.heading.z * ARROW_WALK.lead } } : { type: 'pickup', groundId: blade.id };
    stepWorld(world, [command], ARROW_WALK.dt);
  }
  return world;
}

void test('on the shore, a stick held along the arrow walks out of the In-Between into the Hall, on seeds 1 to 8', (): void => {
  for (let seed: number = 1; seed <= ARROW_WALK.seeds; seed += 1) {
    const world: World = armedOnShore(seed);
    const exit: ObjectiveTarget = must(objectiveTarget(world), `seed ${seed}: the way out`);
    assert.equal(exit.kind, 'exit');
    const run: ArrowRun = holdAlongArrow(world, left('between'), bound(world, exit.pos));
    assert.ok(run.arrived, `seed ${seed}: still on the shore`);
    assert.equal(world.zone.id, 'hall_of_time');
    assert.ok(run.stall <= ARROW_WALK.stall, `seed ${seed}: stood still ${run.stall.toFixed(2)} s`);
  }
});
