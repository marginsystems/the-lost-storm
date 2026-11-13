import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { findPath } from '../nav/path.ts';
import type { Vec2 } from '../math.ts';
import { isWalkable, nearestWalkable } from '../nav/grid.ts';
import type { Steering, SteerStep } from './movement.ts';
import { alignedSpeed, separateActors, steerAlong, steerHeading, turnToward } from './movement.ts';
import type { Bot } from '../bot.ts';
import { botFight, CAREFUL, createBot } from '../bot.ts';
import { arena, ARENA_CENTRE, place } from '../../test/arena-support.ts';
import type { ActorState, MonsterState, World } from './types.ts';
import { spawnPacks } from './monsters.ts';
import { roadWorld, roadZone } from '../../test/road-support.ts';

const STEER: Steering = { maxTurnRate: 16, minTurnRate: 2, turnGain: 24, fullSpeedAngle: 0.35, sharpAngle: 0.9, sharpSpeed: 0, passRadius: 0.45, settleRadius: 0.3 };

void test('turnToward turns by at most the step and takes the short way round', (): void => {
  assert.equal(turnToward(0, 0.1, 0.5), 0.1);
  assert.equal(turnToward(0, 2, 0.5), 0.5);
  assert.equal(turnToward(3, -3, 0.1), 3.1);
  assert.equal(turnToward(-3, 3, 0.1), -3.1);
});

void test('steerAlong reports no progress and slides nowhere when pressed head-on against a flat wall', (): void => {
  const world: World = roadWorld(roadZone({ tiles: ['wwww www', 'wwww www', 'wwww www', 'wwww www'] }));
  const player = world.player;
  const path: Vec2[] = [{ x: 20, z: 14 }];
  player.pos = { x: 20.5, z: 14 };
  player.facing = -Math.PI / 2;
  const step: SteerStep = steerAlong(world.grid, player, path, 0.2, 1 / 60, STEER);
  assert.equal(step.moved, 0);
  assert.equal(player.motion, 'still');
  assert.deepEqual(player.pos, { x: 20.5, z: 14 });
});

void test('a step longer than the gap to a flat wall closes straight in to the wall instead of stopping short or sliding', (): void => {
  const world: World = roadWorld(roadZone({ tiles: ['wwww www', 'wwww www', 'wwww www', 'wwww www'] }));
  const player = world.player;
  const path: Vec2[] = [{ x: 20, z: 14 }];
  player.pos = { x: 20.6, z: 14 };
  player.facing = -Math.PI / 2;
  steerAlong(world.grid, player, path, 0.2, 1 / 60, STEER);
  assert.ok(player.pos.x < 20.51, `stopped at x ${player.pos.x.toFixed(3)}`);
  assert.equal(player.pos.z, 14);
});

void test('separating a crowd never pushes anyone into a wall', (): void => {
  const world: World = roadWorld(roadZone({ tiles: ['wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww'] }));
  world.zone = { ...world.zone, packs: [{ x: 2, z: 22, members: [{ monster: 'mended', count: 6, mods: [] }], when: [] }] };
  spawnPacks(world);
  for (const monster of world.monsters) {
    monster.pos = { x: 1.1, z: 22 };
    monster.motion = 'knocked';
  }
  world.player.pos = { x: 1.1, z: 22.2 };
  for (let pass: number = 0; pass < 10; pass += 1) separateActors(world, 1 / 60, new Map());
  for (const monster of world.monsters) assert.ok(isWalkable(world.grid, monster.pos.x, monster.pos.z), `monster at ${monster.pos.x},${monster.pos.z}`);
  const first: MonsterState = must(world.monsters[0], 'first');
  assert.ok(first.pos.z !== 22 || first.pos.x !== 1.1);
});

void test('a crowd only shoves those already moving: a planted actor keeps his feet and a walker is held back along his own step', (): void => {
  const world: World = roadWorld(roadZone({ tiles: ['wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww'] }));
  world.zone = { ...world.zone, packs: [{ x: 10, z: 8, members: [{ monster: 'mended', count: 2, mods: [] }], when: [] }] };
  spawnPacks(world);
  const planted: MonsterState = must(world.monsters[0], 'planted');
  const walker: MonsterState = must(world.monsters[1], 'walker');
  planted.pos = { x: 10, z: 8 };
  walker.pos = { x: 10.2, z: 8 };
  world.player.pos = { x: 30, z: 8 };
  separateActors(world, 1 / 60, new Map());
  assert.deepEqual(planted.pos, { x: 10, z: 8 });
  assert.deepEqual(walker.pos, { x: 10.2, z: 8 });
  walker.motion = 'stride';
  separateActors(world, 1 / 60, new Map([[walker, { x: -0.1, z: 0 }]]));
  assert.deepEqual(planted.pos, { x: 10, z: 8 });
  assert.ok(Math.abs(walker.pos.x - 10.3) < 1e-9, `the walker is held back along his own step, not pushed sideways: ${walker.pos.x}`);
  assert.equal(walker.pos.z, 8);
});

void test('steerHeading eases into a new heading: capped while far, slowing as it closes, landing exactly', (): void => {
  const dt: number = 1 / 60;
  assert.ok(Math.abs(steerHeading(0, Math.PI / 2, dt, STEER) - STEER.maxTurnRate * dt) < 1e-9);
  assert.ok(Math.abs(steerHeading(0, 0.2, dt, STEER) - STEER.turnGain * 0.2 * dt) < 1e-9);
  assert.equal(steerHeading(0, 0.01, dt, STEER), 0.01);
  assert.ok(steerHeading(3, -3, dt, STEER) > 3);
  let facing: number = 0;
  let lastTurn: number = Infinity;
  for (let step: number = 0; step < 30; step += 1) {
    const next: number = steerHeading(facing, 1, dt, STEER);
    assert.ok(next - facing <= lastTurn + 1e-12);
    lastTurn = next - facing;
    facing = next;
  }
  assert.equal(facing, 1);
});

void test('alignedSpeed keeps full speed through gentle turns and eases to a stop for a turn behind', (): void => {
  assert.equal(alignedSpeed(0, STEER), 1);
  assert.equal(alignedSpeed(-STEER.fullSpeedAngle, STEER), 1);
  assert.equal(alignedSpeed(Math.PI, STEER), STEER.sharpSpeed);
  let last: number = 1;
  for (let angle: number = 0; angle <= Math.PI; angle += 0.05) {
    const speed: number = alignedSpeed(angle, STEER);
    assert.ok(speed <= last + 1e-12);
    last = speed;
  }
});

void test('a walker whose way runs into a wall turns to walk along it, every step along his facing, and still gets there', (): void => {
  const world: World = roadWorld(roadZone({ tiles: ['wwwwwwww', 'wwwwwwww', 'wwww www', 'wwwwwwww'] }));
  const player = world.player;
  const goal: Vec2 = { x: 21, z: 14 };
  const path: Vec2[] = [goal];
  player.pos = { x: 15, z: 10 };
  player.facing = Math.atan2(goal.x - player.pos.x, goal.z - player.pos.z);
  let steps: number = 0;
  while (path.length > 0 && steps < 600) {
    const from: Vec2 = { x: player.pos.x, z: player.pos.z };
    steerAlong(world.grid, player, path, 0.1, 1 / 60, STEER);
    const moved: number = Math.hypot(player.pos.x - from.x, player.pos.z - from.z);
    if (moved > 1e-6) assert.ok(((player.pos.x - from.x) * Math.sin(player.facing) + (player.pos.z - from.z) * Math.cos(player.facing)) / moved > 0.7, `step ${steps} went off the facing`);
    assert.ok(isWalkable(world.grid, player.pos.x, player.pos.z));
    steps += 1;
  }
  assert.equal(path.length, 0);
});

void test('steerAlong moves the way the hero faces, so a turn bends the walk instead of sliding the body', (): void => {
  const world: World = roadWorld(roadZone({ tiles: ['wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww'] }));
  const player = world.player;
  player.pos = { x: 16, z: 16 };
  player.facing = 0;
  const path: Vec2[] = [{ x: 17, z: 22 }];
  const dt: number = 1 / 60;
  const step: SteerStep = steerAlong(world.grid, player, path, 0.1, dt, STEER);
  assert.ok(player.facing > 0 && player.facing < Math.atan2(1, 6));
  assert.ok(Math.abs(Math.atan2(player.pos.x - 16, player.pos.z - 16) - player.facing) < 1e-9);
  assert.ok(Math.abs(step.moved - step.tried) < 1e-9);
});

void test('steerAlong turns on the spot toward a point behind, and still counts as trying to go there', (): void => {
  const world: World = roadWorld(roadZone({ tiles: ['wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww'] }));
  const player = world.player;
  player.pos = { x: 16, z: 8 };
  player.facing = 0;
  const path: Vec2[] = [{ x: 16, z: 2 }];
  const step: SteerStep = steerAlong(world.grid, player, path, 0.1, 1 / 60, STEER);
  assert.deepEqual(player.pos, { x: 16, z: 8 });
  assert.equal(step.tried, 0);
  assert.ok(player.facing !== 0);
  assert.equal(path.length, 1);
});

void test('steerAlong settles onto the last point without whipping round at the end', (): void => {
  const world: World = roadWorld(roadZone({ tiles: ['wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww'] }));
  const player = world.player;
  player.pos = { x: 16, z: 8 };
  player.facing = 0.3;
  const path: Vec2[] = [{ x: 16.02, z: 8.2 }];
  steerAlong(world.grid, player, path, 0.5, 1 / 60, STEER);
  assert.equal(player.facing, 0.3);
  assert.deepEqual(player.pos, { x: 16.02, z: 8.2 });
  assert.equal(path.length, 0);
});

void test('steerAlong drops a waypoint it has nearly reached and steers for the next', (): void => {
  const world: World = roadWorld(roadZone({ tiles: ['wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww'] }));
  const player = world.player;
  player.pos = { x: 16, z: 8 };
  player.facing = 0;
  const path: Vec2[] = [{ x: 16, z: 8.3 }, { x: 16, z: 14 }];
  steerAlong(world.grid, player, path, 0.1, 1 / 60, STEER);
  assert.equal(path.length, 1);
  assert.ok(Math.abs(player.pos.z - 8.1) < 1e-9);
});

const CONTRACT = {
  seeds: [3, 5, 8],
  fighters: ['unfinished_brute', 'unfinished_taker', 'unfinished_thrower', 'first_brute', 'first_thrower', 'unfinished_borrower', 'timekeeper_duelist', 'mended', 'mender', 'still_standing'],
  ring: 7,
  still: 1e-4,
  teleport: 1.5,
  alongFacing: 0.7,
  fightSeconds: 40,
} as const;

interface Breach {
  readonly who: string;
  readonly what: string;
}

function fightBreaches(seed: number, fighters: readonly string[]): { readonly breaches: Breach[]; readonly knocked: number } {
  const world: World = arena(seed);
  world.player.maxLife = 1e6;
  fighters.forEach((kind: string, index: number): void => {
    const angle: number = (index / fighters.length) * Math.PI * 2;
    place(world, kind, { x: ARENA_CENTRE.x + Math.cos(angle) * CONTRACT.ring, z: ARENA_CENTRE.z + Math.sin(angle) * CONTRACT.ring });
  });
  const breaches: Breach[] = [];
  const last: Map<ActorState, Vec2> = new Map<ActorState, Vec2>();
  let knocked: number = 0;
  const watch = (): void => {
    world.player.life = world.player.maxLife;
    const actors: { readonly actor: ActorState; readonly who: string }[] = [{ actor: world.player, who: 'hero' }, ...world.monsters.map((monster: MonsterState): { readonly actor: ActorState; readonly who: string } => ({ actor: monster, who: monster.def.id }))];
    for (const { actor, who } of actors) {
      const from: Vec2 | undefined = last.get(actor);
      last.set(actor, { x: actor.pos.x, z: actor.pos.z });
      if (from === undefined || !actor.alive) continue;
      const dx: number = actor.pos.x - from.x;
      const dz: number = actor.pos.z - from.z;
      const moved: number = Math.hypot(dx, dz);
      if (actor.motion === 'knocked') knocked += 1;
      if (moved > CONTRACT.teleport) continue;
      if (moved > CONTRACT.still && actor.motion === 'still') breaches.push({ who, what: `moved ${moved.toFixed(3)} m while ${actor.action === null ? 'standing' : `in ${actor.action.skill.id}`}` });
      if (actor.motion === 'stride' && moved <= CONTRACT.still) breaches.push({ who, what: `strode in place with a gait of ${actor.gait.toFixed(2)} m/s` });
      if (actor.motion !== 'stride' || moved <= CONTRACT.still) continue;
      const along: number = (dx * Math.sin(actor.facing) + dz * Math.cos(actor.facing)) / moved;
      if (along < CONTRACT.alongFacing) breaches.push({ who, what: `walked ${moved.toFixed(3)} m at ${Math.acos(Math.max(-1, along)).toFixed(2)} rad off his facing` });
    }
  };
  const bot: Bot = createBot(world, CAREFUL, watch);
  botFight(bot, (): boolean => world.time > CONTRACT.fightSeconds || world.monsters.every((monster: MonsterState): boolean => !monster.alive), null);
  return { breaches, knocked };
}

void test('the locomotion contract: in a fight with knockbacks nobody moves while standing or acting, nobody walks in place, and every walk goes along the walker facing', (): void => {
  for (const seed of CONTRACT.seeds) {
    const { breaches, knocked } = fightBreaches(seed, CONTRACT.fighters);
    assert.ok(knocked > 0, `seed ${seed} had no knockback to check`);
    const kinds: Map<string, number> = new Map<string, number>();
    for (const breach of breaches) {
      const key: string = `${breach.who} ${breach.what}`;
      kinds.set(key, (kinds.get(key) ?? 0) + 1);
    }
    assert.deepEqual([...kinds.entries()].map(([key, count]: [string, number]): string => `${count}x ${key}`), [], `seed ${seed}: ${breaches.length} breaches`);
  }
});

const CORNER_WALK = {
  tallFrom: 1.5,
  gap: 3,
  bearings: 12,
  snap: 2,
  seconds: 4,
  dt: 1 / 60,
  speed: 4.5,
  still: 1e-4,
} as const;

void test('the hero walking a path round any tall Hall prop slides along its corners and is never stopped dead', (): void => {
  const content: Content = loadContent();
  const world: World = worldIn(content, 'hall_of_time', 5);
  const stops: string[] = [];
  for (const placed of world.zone.props) {
    const def = content.props.get(placed.prop);
    if (def === undefined || placed.when.length > 0 || def.height < CORNER_WALK.tallFrom) continue;
    for (let bearing: number = 0; bearing < CORNER_WALK.bearings; bearing += 1) {
      const angle: number = (bearing / CORNER_WALK.bearings) * Math.PI * 2;
      const from: Vec2 | null = nearestWalkable(world.grid, { x: placed.x - Math.cos(angle) * CORNER_WALK.gap, z: placed.z - Math.sin(angle) * CORNER_WALK.gap }, CORNER_WALK.snap);
      const to: Vec2 | null = nearestWalkable(world.grid, { x: placed.x + Math.cos(angle) * CORNER_WALK.gap, z: placed.z + Math.sin(angle) * CORNER_WALK.gap }, CORNER_WALK.snap);
      if (from === null || to === null) continue;
      const hero: ActorState = world.player;
      hero.pos = { ...from };
      const path: Vec2[] = findPath(world.grid, from, to);
      for (let step: number = 0; step < Math.round(CORNER_WALK.seconds / CORNER_WALK.dt) && path.length > 0; step += 1) {
        const moved: SteerStep = steerAlong(world.grid, hero, path, CORNER_WALK.speed * CORNER_WALK.dt, CORNER_WALK.dt, STEER);
        if (moved.tried > CORNER_WALK.still && moved.moved <= CORNER_WALK.still) {
          stops.push(`${placed.prop} (${placed.x}, ${placed.z}) bearing ${bearing}: stopped at (${hero.pos.x.toFixed(2)}, ${hero.pos.z.toFixed(2)})`);
          break;
        }
      }
    }
  }
  assert.deepEqual(stops, []);
});
