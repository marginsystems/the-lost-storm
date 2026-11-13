import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sceneZone } from '../../test/motion-support.ts';
import { SCENE_BASE } from '../../test/road-support.ts';
import { worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, PropDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import type { Blocker } from '../nav/grid.ts';
import { isWalkable, propBlockers } from '../nav/grid.ts';
import { findPath } from '../nav/path.ts';
import { allHold } from './conditions.ts';
import { clearMoments } from './moments.ts';
import { angleBetween } from './movement.ts';
import { aroundPath, pastBlocks, pathLength, roundPast, stillRound, STICK } from './stick.ts';
import { stepWorld } from './step.ts';
import { setFlags } from './story.ts';
import type { World } from './types.ts';
import { enterZone } from './zones.ts';

const content: Content = loadContent();

const HELD = {
  dt: 1 / 30,
  stick: 3.2,
  across: 8,
  clear: 1.5,
  past: 0.5,
  bearings: 8,
  stall: 0.5,
  still: 1e-3,
  visible: 0.005,
  strideCos: 0.76,
  slack: 1.6,
  grace: 2,
  exitClear: 4,
  quiet: 1e9,
  wallSeconds: 2,
  wallStart: { x: 10, z: 6 },
  wallAcross: 8,
} as const;

function quietWorld(zoneId: string): World {
  const world: World = worldIn(content, zoneId, 1);
  setFlags(world, content.moments.cleared);
  clearMoments(world);
  world.monsters = [];
  world.strikeTimer = HELD.quiet;
  world.player.invulnerable = HELD.quiet;
  return world;
}

function standAt(world: World, at: Vec2, facing: number): void {
  world.player.pos = { x: at.x, z: at.z };
  world.player.facing = facing;
  world.player.path = [];
  world.player.intent = { type: 'idle' };
  world.player.repathTimer = 0;
  world.player.queued = null;
  world.player.knock = { x: 0, z: 0 };
}

function extentOf(blockers: readonly Blocker[], centre: Vec2): number {
  let reach: number = 0;
  for (const blocker of blockers) {
    if (blocker.kind === 'capsule') reach = Math.max(reach, distance(blocker.from, centre) + blocker.radius, distance(blocker.to, centre) + blocker.radius);
    else for (const point of blocker.outline) reach = Math.max(reach, distance(point, centre));
  }
  return reach;
}

interface HeldRun {
  readonly passed: boolean;
  readonly stall: number;
  readonly worstOff: number;
}

function holdToward(world: World, direction: Vec2, passed: (world: World) => boolean, limit: number): HeldRun {
  let still: number = 0;
  let stall: number = 0;
  let worstOff: number = 0;
  for (let seconds: number = 0; seconds < limit && !passed(world); seconds += HELD.dt) {
    const from: Vec2 = { ...world.player.pos };
    stepWorld(world, [{ type: 'walk', held: seconds > 0, dest: { x: from.x + direction.x * HELD.stick, z: from.z + direction.z * HELD.stick } }], HELD.dt);
    const moved: number = distance(from, world.player.pos);
    still = moved < HELD.still ? still + HELD.dt : 0;
    stall = Math.max(stall, still);
    if (moved > HELD.visible) worstOff = Math.max(worstOff, Math.abs(angleBetween(world.player.facing, Math.atan2(world.player.pos.x - from.x, world.player.pos.z - from.z))));
  }
  return { passed: passed(world), stall, worstOff };
}

void test('past a blocked point lies the first walkable ground further along the same line, and a wall with nothing behind it has none', (): void => {
  const world: World = quietWorld('hall_of_time');
  const from: Vec2 = { x: 30, z: 5 };
  assert.ok(isWalkable(world.grid, from.x, from.z));
  assert.deepEqual(pastBlocks(world.grid, from, { x: 30, z: 1 }), []);
  const open: Vec2 = { x: 30, z: 8 };
  assert.deepEqual(pastBlocks(world.grid, from, open)[0], open);
});

void test('a detour is followed only while it still ends where the line comes out past the block', (): void => {
  const end: Vec2 = { x: 10, z: 10 };
  assert.ok(stillRound([{ x: 5, z: 5 }, end], [{ x: end.x + STICK.reuse / 2, z: end.z }]));
  assert.equal(stillRound([{ x: 5, z: 5 }, end], [{ x: end.x + STICK.reuse * 2, z: end.z }]), false);
  assert.equal(stillRound([], [end]), false);
});

void test('a stick held into the outer wall of the Hall stops him at the wall: no slide, no detour', (): void => {
  const world: World = quietWorld('hall_of_time');
  standAt(world, { x: 30, z: 5 }, Math.PI);
  const run: HeldRun = holdToward(world, { x: 0, z: -1 }, (): boolean => false, HELD.wallSeconds);
  assert.equal(run.passed, false);
  assert.ok(Math.abs(world.player.pos.x - 30) < HELD.past, `he slid to x ${world.player.pos.x.toFixed(2)}`);
});

void test('a stick held head-on at any prop under 8 m across that he can walk round never stalls more than half a second: he walks round it, the stride along his facing', (): void => {
  const problems: string[] = [];
  let runs: number = 0;
  for (const zone of content.zones.values()) {
    if (zone.kind === 'void') continue;
    const world: World = quietWorld(zone.id);
    for (const placed of zone.props) {
      const def: PropDef | undefined = content.props.get(placed.prop);
      if (def === undefined || !allHold(world, placed.when)) continue;
      const centre: Vec2 = { x: placed.x + world.shift.x, z: placed.z + world.shift.z };
      const blockers: Blocker[] = propBlockers(def, centre.x, centre.z, placed.rotationDegrees);
      const extent: number = extentOf(blockers, centre);
      if (blockers.length === 0 || extent * 2 > HELD.across) continue;
      if (world.zone.exits.some((exit): boolean => distance(exit, centre) < extent + exit.radius + HELD.exitClear)) continue;
      for (let bearing: number = 0; bearing < HELD.bearings; bearing += 1) {
        const angle: number = (bearing / HELD.bearings) * Math.PI * 2;
        const direction: Vec2 = { x: Math.sin(angle), z: Math.cos(angle) };
        const start: Vec2 = { x: centre.x - direction.x * (extent + HELD.clear), z: centre.z - direction.z * (extent + HELD.clear) };
        const far: Vec2 = { x: centre.x + direction.x * (extent + HELD.clear), z: centre.z + direction.z * (extent + HELD.clear) };
        if (!isWalkable(world.grid, start.x, start.z) || !isWalkable(world.grid, far.x, far.z)) continue;
        const round: Vec2[] | null = aroundPath(world.grid, start, far);
        if (round === null) continue;
        runs += 1;
        standAt(world, start, angle);
        const beyond = (walker: World): boolean => (walker.player.pos.x - centre.x) * direction.x + (walker.player.pos.z - centre.z) * direction.z > extent + HELD.past;
        const run: HeldRun = holdToward(world, direction, beyond, (pathLength(start, round) / world.player.stats.moveSpeed) * HELD.slack + HELD.grace);
        const label: string = `${zone.id} ${placed.prop} at (${placed.x}, ${placed.z}) from bearing ${bearing}`;
        if (!run.passed) problems.push(`${label}: never got past, at (${world.player.pos.x.toFixed(1)}, ${world.player.pos.z.toFixed(1)})`);
        if (run.stall > HELD.stall) problems.push(`${label}: stood still ${run.stall.toFixed(2)} s`);
        if (Math.cos(run.worstOff) < HELD.strideCos) problems.push(`${label}: stepped ${(run.worstOff * 180 / Math.PI).toFixed(0)} degrees off his facing`);
      }
    }
  }
  assert.ok(runs > 0);
  assert.deepEqual(problems, []);
});

const LONG_WALL: readonly string[] = ['... ...', '... ...', '... ...', '... ...', '... ...', '... ...', '.......'];

function longWallWorld(): World {
  const world: World = worldIn(content, content.world.start, 1);
  enterZone(world, sceneZone(SCENE_BASE, 'test_long_wall', { tiles: LONG_WALL, props: [], start: HELD.wallStart }), { type: 'start' });
  world.monsters = [];
  world.player.invulnerable = HELD.quiet;
  return world;
}

void test('a detour much longer than the straight line is refused, so a stick held into a long wall with its only way round far off stops him at the wall', (): void => {
  const world: World = longWallWorld();
  const start: Vec2 = HELD.wallStart;
  const across: Vec2 = { x: start.x + HELD.wallAcross, z: start.z };
  assert.ok(isWalkable(world.grid, start.x, start.z) && isWalkable(world.grid, across.x, across.z));
  const round: Vec2[] = findPath(world.grid, start, across);
  assert.ok(round.length > 0 && pathLength(start, round) > distance(start, across) * STICK.detour, 'the only way round is long');
  assert.equal(aroundPath(world.grid, start, across), null);
  assert.equal(roundPast(world.grid, start, pastBlocks(world.grid, start, { x: start.x + HELD.stick, z: start.z })), null);
  standAt(world, start, Math.PI / 2);
  holdToward(world, { x: 1, z: 0 }, (): boolean => false, HELD.wallSeconds);
  assert.ok(world.player.pos.x > start.x && world.player.pos.x < start.x + HELD.wallAcross / 2, `he is at x ${world.player.pos.x.toFixed(2)}`);
  assert.ok(Math.abs(world.player.pos.z - start.z) < HELD.past, `he slid to z ${world.player.pos.z.toFixed(2)}`);
});
