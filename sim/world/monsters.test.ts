import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MotionSample, TestScene } from '../../test/motion-support.ts';
import { MOTION_DT, motionProblems, placedProp, sampleOf, sceneZone } from '../../test/motion-support.ts';
import { ARENA_CENTRE, arena, place } from '../../test/arena-support.ts';
import { SCENE_BASE } from '../../test/road-support.ts';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { blockerGap, isWalkable, lineOfSight, lineWalkable, nearestWalkable, propOutlines, routedGrid } from '../nav/grid.ts';
import type { Blocker, NavGrid } from '../nav/grid.ts';
import { findPath } from '../nav/path.ts';
import { forceStrike } from './moments.ts';
import { spawnPacks } from './monsters.ts';
import { stepWorld } from './step.ts';
import { createWorld } from './create.ts';
import { choicesOpen } from './death.ts';
import { objectiveTarget } from './objective.ts';
import type { ObjectiveTarget } from './objective.ts';
import type { Command, MomentState, MonsterState, World } from './types.ts';
import { enterZone } from './zones.ts';

const content: Content = loadContent();
const base: ZoneDef = SCENE_BASE;

const LIMITS = {
  turnRate: 12,
  engageSlack: 1.6,
  settleTime: 2,
  seconds: 10,
  paceEvery: 1.5,
  blockedSeconds: 3,
  pinnedRunTime: 0.15,
  flickerGap: 0.3,
  pressedStep: 0.01,
  callerClear: 3,
} as const;

interface Scene extends TestScene {
  readonly name: string;
  readonly monsters: readonly Vec2[];
  readonly pace: readonly Vec2[];
}

interface Track {
  readonly monster: MonsterState;
  readonly samples: MotionSample[];
}

const OPEN: readonly string[] = ['.......', '.......', '.......', '.......', '.......', '.......', '.......'];
const CORNER: readonly string[] = ['......', '......', '......', '...   ', '...   ', '...   '];

const SCENES: readonly Scene[] = [
  { name: 'wall corner', tiles: CORNER, props: [], start: { x: 6, z: 20 }, monsters: [{ x: 20, z: 7 }], pace: [] },
  {
    name: 'zig-zag wall',
    tiles: ['..........', '..........', '......  ..', '.....  ...', '....  ....', '...  .....', '..  ......'],
    props: [],
    start: { x: 6, z: 14 },
    monsters: [{ x: 30, z: 22 }],
    pace: [],
  },
  { name: 'prop in the way', tiles: OPEN, props: [placedProp('mossy_pillar', 14, 14)], start: { x: 14, z: 6 }, monsters: [{ x: 14, z: 21 }], pace: [] },
  {
    name: 'doorway narrower than two actors',
    tiles: ['.......', '.......', '.......', '   .   ', '.......', '.......', '.......'],
    props: [placedProp('mossy_column', 13.2, 14)],
    start: { x: 14, z: 4 },
    monsters: [{ x: 10, z: 22 }, { x: 14, z: 23 }, { x: 18, z: 22 }],
    pace: [],
  },
  {
    name: 'crowd converging',
    tiles: OPEN,
    props: [],
    start: { x: 14, z: 14 },
    monsters: [0, 1, 2, 3, 4, 5, 6, 7].map((index: number): Vec2 => ({ x: 14 + Math.cos((index / 8) * Math.PI * 2) * 9, z: 14 + Math.sin((index / 8) * Math.PI * 2) * 9 })),
    pace: [],
  },
  { name: 'target pacing behind a wall edge', tiles: CORNER, props: [], start: { x: 6, z: 16 }, monsters: [{ x: 21, z: 9 }], pace: [{ x: 9, z: 15 }, { x: 4, z: 18 }] },
];

const KINDS: readonly string[] = ['mended', 'mender', 'stormcaller_rival', 'unfinished_colossus', 'unfinished_thrower'];

function spawn(world: World, kind: string, at: Vec2): MonsterState {
  world.zone = { ...world.zone, packs: [{ x: at.x, z: at.z, members: [{ monster: kind, count: 1, mods: [] }], when: [] }] };
  spawnPacks(world);
  const monster: MonsterState = must(world.monsters.at(-1), `${kind} spawned`);
  monster.pos = must(nearestWalkable(routedGrid(world.grid), at, 6), 'walkable spawn');
  monster.lastPos = { x: monster.pos.x, z: monster.pos.z };
  monster.spawnTime = 0;
  monster.aggro = true;
  return monster;
}

function build(scene: Scene, kind: string): World {
  const world: World = worldIn(content, content.world.start, 7);
  enterZone(world, sceneZone(base, `test_${scene.name}`, scene), { type: 'start' });
  world.events = [];
  world.monsters = [];
  for (const at of scene.monsters) spawn(world, kind, at);
  return world;
}

function run(scene: Scene, kind: string): { world: World; tracks: Track[] } {
  const world: World = build(scene, kind);
  const tracks: Track[] = world.monsters.map((monster: MonsterState): Track => ({ monster, samples: [] }));
  const steps: number = Math.round(LIMITS.seconds / MOTION_DT);
  const paceEvery: number = Math.round(LIMITS.paceEvery / MOTION_DT);
  for (let step: number = 0; step < steps; step += 1) {
    world.player.life = world.player.maxLife;
    for (const track of tracks) track.monster.life = track.monster.maxLife;
    const commands: Command[] = [];
    if (scene.pace.length > 0 && step % paceEvery === 0) commands.push({ type: 'move', dest: must(scene.pace[(step / paceEvery) % scene.pace.length], 'pace point'), held: false });
    const acting: boolean[] = tracks.map((track: Track): boolean => track.monster.action !== null);
    stepWorld(world, commands, MOTION_DT);
    tracks.forEach((track: Track, index: number): void => {
      track.samples.push(sampleOf(track.monster, acting[index] ?? false));
    });
  }
  return { world, tracks };
}

function longestReach(world: World, monster: MonsterState): number {
  const ids: string[] = [monster.def.skill, ...(monster.def.boss?.phases.flatMap((phase) => phase.skills.map((entry) => entry.skill)) ?? [])];
  return Math.max(...ids.map((id: string): number => must(world.content.skills.get(id), id).engageRange));
}

function settled(world: World, track: Track): boolean {
  const monster: MonsterState = track.monster;
  const tail: MotionSample[] = track.samples.slice(-Math.round(LIMITS.settleTime / MOTION_DT));
  const still: boolean = tail.every((entry: MotionSample): boolean => !entry.moving || !entry.free);
  const reach: number = distance(monster.pos, world.player.pos) - world.player.radius;
  const inRange: boolean = reach <= longestReach(world, monster) + LIMITS.engageSlack && lineOfSight(world.grid, monster.pos, world.player.pos);
  return inRange || still;
}

function answersTheStep(switches: readonly number[], index: number): boolean {
  const at: number | undefined = switches[index];
  return at !== undefined && at >= LIMITS.callerClear && at - LIMITS.callerClear < LIMITS.flickerGap && switches.findIndex((other: number): boolean => other >= LIMITS.callerClear) === index;
}

function retreating(monster: MonsterState): boolean {
  return monster.stance === 'retreat';
}

for (const scene of SCENES) {
  for (const kind of KINDS) {
    void test(`${kind} moves without jitter: ${scene.name}`, (): void => {
      const { world, tracks } = run(scene, kind);
      const problems: string[] = [];
      for (const track of tracks) {
        const label: string = `#${track.monster.id}`;
        if (!isWalkable(world.grid, track.monster.pos.x, track.monster.pos.z)) problems.push(`${label} left walkable ground`);
        problems.push(...motionProblems(label, track.samples, LIMITS.turnRate));
        if (scene.pace.length === 0 && scene.monsters.length === 1 && !settled(world, track)) problems.push(`${label} neither reached the target nor stopped`);
      }
      assert.deepEqual(problems, []);
    });
  }
}

void test('a caster backed against a wall stops instead of running in place', (): void => {
  const world: World = worldIn(content, content.world.start, 2);
  enterZone(world, sceneZone(base, 'test_blocked', { tiles: OPEN, props: [], start: { x: 4, z: 14 } }), { type: 'start' });
  world.monsters = [];
  const caster: MonsterState = spawn(world, 'mender', { x: 1.2, z: 14 });
  caster.stance = 'retreat';
  const samples: MotionSample[] = [];
  let pressed: number = 0;
  for (let step: number = 0; step < Math.round(LIMITS.blockedSeconds / MOTION_DT); step += 1) {
    world.player.life = world.player.maxLife;
    caster.cooldowns = { [caster.def.skill]: LIMITS.blockedSeconds };
    const before: Vec2 = { x: caster.pos.x, z: caster.pos.z };
    stepWorld(world, [], MOTION_DT);
    samples.push(sampleOf(caster, false));
    if (retreating(caster) && distance(before, caster.pos) < LIMITS.pressedStep) pressed += 1;
  }
  assert.deepEqual(motionProblems('caster', samples, LIMITS.turnRate), []);
  assert.ok(pressed * MOTION_DT <= LIMITS.pinnedRunTime, `backed into the wall for ${(pressed * MOTION_DT).toFixed(2)} s`);
});

void test('a monster pinned against a prop stops its run within a tenth of a second', (): void => {
  const world: World = worldIn(content, content.world.start, 2);
  enterZone(world, sceneZone(base, 'test_pinned', { tiles: OPEN, props: [placedProp('mossy_pillar', 14, 14)], start: { x: 14, z: 3 } }), { type: 'start' });
  world.monsters = [];
  const thrall: MonsterState = spawn(world, 'mended', { x: 14, z: 16.2 });
  let blockedSteps: number = 0;
  let runningWhileBlocked: number = 0;
  for (let step: number = 0; step < Math.round(1 / MOTION_DT); step += 1) {
    thrall.path = [{ x: 14, z: 14 }];
    thrall.repathTimer = LIMITS.seconds;
    const before: Vec2 = { x: thrall.pos.x, z: thrall.pos.z };
    stepWorld(world, [], MOTION_DT);
    if (distance(before, thrall.pos) > 1e-4) continue;
    blockedSteps += 1;
    if (thrall.moving) runningWhileBlocked += 1;
  }
  assert.ok(blockedSteps > 0);
  assert.ok(runningWhileBlocked * MOTION_DT <= LIMITS.pinnedRunTime, `ran for ${(runningWhileBlocked * MOTION_DT).toFixed(2)} s while pinned`);
});

void test('a stalker circles the hero at its orbit range while its leap recovers, smoothly, then leaps in', (): void => {
  const world: World = arena(8);
  const ghoul: MonsterState = place(world, 'test_ghoul', { x: ARENA_CENTRE.x + 10, z: ARENA_CENTRE.z });
  const orbit: number = ghoul.def.behaviour.type === 'stalker' ? ghoul.def.behaviour.orbitRange : 0;
  const samples: MotionSample[] = [];
  const gaps: number[] = [];
  let swept: number = 0;
  let last: number = Math.atan2(ghoul.pos.x - ARENA_CENTRE.x, ghoul.pos.z - ARENA_CENTRE.z);
  for (let step: number = 0; step < Math.round(4 / MOTION_DT); step += 1) {
    world.player.pos = { ...ARENA_CENTRE };
    world.player.life = world.player.maxLife;
    ghoul.cooldowns = { test_pounce: 1 };
    const acting: boolean = ghoul.action !== null;
    stepWorld(world, [], MOTION_DT);
    samples.push(sampleOf(ghoul, acting));
    const angle: number = Math.atan2(ghoul.pos.x - ARENA_CENTRE.x, ghoul.pos.z - ARENA_CENTRE.z);
    swept += Math.abs(Math.atan2(Math.sin(angle - last), Math.cos(angle - last)));
    last = angle;
    if (step * MOTION_DT > 2) gaps.push(distance(ghoul.pos, ARENA_CENTRE));
  }
  assert.deepEqual(motionProblems('ghoul', samples, LIMITS.turnRate), []);
  assert.ok(swept > 1, `it went round the hero (${swept.toFixed(2)} rad)`);
  assert.ok(Math.min(...gaps) > orbit - 2 && Math.max(...gaps) < orbit + 2.5, `it kept to its ring (${Math.min(...gaps).toFixed(1)} to ${Math.max(...gaps).toFixed(1)})`);
  ghoul.cooldowns = {};
  let leapt: boolean = false;
  for (let step: number = 0; step < Math.round(1 / MOTION_DT) && !leapt; step += 1) {
    world.player.pos = { ...ARENA_CENTRE };
    leapt = stepWorld(world, [], MOTION_DT).some((event): boolean => event.type === 'skill_start' && event.actorId === ghoul.id);
  }
  assert.ok(leapt, 'it leaps once the leap is ready');
});

void test('a ranged monster backs off from a hero who closes in and holds once clear, without flickering between the two', (): void => {
  const world: World = arena(9);
  const caller: MonsterState = place(world, 'test_caller', { x: ARENA_CENTRE.x + 8, z: ARENA_CENTRE.z });
  const retreat: number = caller.def.behaviour.type === 'ranged' ? caller.def.behaviour.retreatRange : 0;
  const switches: number[] = [];
  let stance = caller.stance;
  let retreated: boolean = false;
  for (let step: number = 0; step < Math.round(6 / MOTION_DT); step += 1) {
    caller.cooldowns = { test_mark: 1 };
    world.player.life = world.player.maxLife;
    const wobble: number = Math.sin(step * MOTION_DT * 9) * 0.6;
    const toward: Vec2 = { x: caller.pos.x - ARENA_CENTRE.x, z: caller.pos.z - ARENA_CENTRE.z };
    const gap: number = Math.hypot(toward.x, toward.z);
    const wanted: number = step * MOTION_DT < LIMITS.callerClear ? retreat - 0.5 + wobble : retreat + 2 + wobble;
    world.player.pos = { x: caller.pos.x - (toward.x / gap) * wanted, z: caller.pos.z - (toward.z / gap) * wanted };
    stepWorld(world, [], MOTION_DT);
    if (caller.stance === 'retreat') retreated = true;
    if (caller.stance !== stance) switches.push(step * MOTION_DT);
    stance = caller.stance;
  }
  assert.ok(retreated, 'it backed off');
  const flickers: number[] = switches.filter((at: number, index: number): boolean => at > LIMITS.settleTime / 4 && index > 0 && !answersTheStep(switches, index) && at - (switches[index - 1] ?? 0) < LIMITS.flickerGap);
  assert.deepEqual(flickers, [], `stance changed at ${switches.map((at: number): string => at.toFixed(2)).join(', ')}`);
});

void test('a summoner calls its own kind to its side, aggroed, and never more than its limit', (): void => {
  const world: World = arena(10);
  const mother: MonsterState = place(world, 'mended', { x: ARENA_CENTRE.x + 6, z: ARENA_CENTRE.z }, ['test_brood']);
  const summon = must(mother.def.summon, 'summon');
  for (let step: number = 0; step < Math.round((summon.cooldown * 3 + 1) / MOTION_DT); step += 1) {
    world.player.life = world.player.maxLife;
    mother.life = mother.maxLife;
    stepWorld(world, [], MOTION_DT);
  }
  const called: MonsterState[] = world.monsters.filter((monster: MonsterState): boolean => monster.summonerId === mother.id);
  assert.equal(called.length, summon.limit);
  for (const minion of called) {
    assert.equal(minion.def.id, mother.def.id);
    assert.deepEqual(minion.def.mods, []);
    assert.equal(minion.aggro, true);
  }
});

void test('a summoned minion never summons in turn, even when its kind can', (): void => {
  const world: World = arena(12);
  const breeder: MonsterState = place(world, 'test_breeder', { x: ARENA_CENTRE.x + 6, z: ARENA_CENTRE.z });
  const summon = must(breeder.def.summon, 'summon');
  for (let step: number = 0; step < Math.round((summon.cooldown * 6) / MOTION_DT); step += 1) {
    world.player.life = world.player.maxLife;
    for (const monster of world.monsters) monster.life = monster.maxLife;
    stepWorld(world, [], MOTION_DT);
  }
  assert.equal(world.monsters.length, 1 + summon.limit);
  assert.ok(world.monsters.every((monster: MonsterState): boolean => monster.summonerId === null || monster.summonerId === breeder.id));
});

const POCKET = {
  spacing: 8,
  wake: 3,
  knockSpeed: 14,
  knockSeconds: 1,
  knockFrom: 1.2,
  strandSeconds: 4,
  strandSpeed: 2.5,
  scan: 0.25,
} as const;

function joined(grid: NavGrid, from: Vec2, to: Vec2): boolean {
  const goal: Vec2 | null = nearestWalkable(grid, to, 8);
  return goal !== null && (lineWalkable(grid, from, goal) || findPath(grid, from, goal).length > 0);
}

void test('every pack in every zone stands on a cell the pathfinder can route, joined to the hero', (): void => {
  for (const zone of content.zones.values()) {
    const world: World = worldIn(content, content.world.start, 2);
    const grid: NavGrid = routedGrid(world.grid);
    for (const monster of world.monsters) {
      assert.ok(isWalkable(grid, monster.pos.x, monster.pos.z), `${zone.id}: ${monster.def.id} spawned in a sealed pocket at (${monster.pos.x.toFixed(2)}, ${monster.pos.z.toFixed(2)})`);
      assert.ok(joined(grid, monster.pos, world.player.pos), `${zone.id}: ${monster.def.id} at (${monster.pos.x.toFixed(2)}, ${monster.pos.z.toFixed(2)}) has no route to the hero`);
    }
  }
});

void test('every echo a Hall moment wakes stands on a routed cell joined to the middle of its bubble', (): void => {
  const hall: ZoneDef = must(content.zones.get('hall_of_time'), 'hall');
  let checked: number = 0;
  for (const def of content.moments.defs.values()) {
    for (let x: number = POCKET.spacing; x < (hall.tiles[0]?.length ?? 0) * hall.cellSize; x += POCKET.spacing) {
      for (let z: number = POCKET.spacing; z < hall.tiles.length * hall.cellSize; z += POCKET.spacing) {
        const world: World = worldIn(content, content.world.start, 2);
        world.monsters = [];
        world.moments = [];
        world.wake = null;
        const grid: NavGrid = routedGrid(world.grid);
        if (!isWalkable(grid, x, z)) continue;
        const moment = forceStrike(world, { x, z }, def.id);
        if (moment === null) continue;
        world.player.pos = { x: moment.pos.x, z: moment.pos.z };
        for (let step: number = 0; step < Math.round(POCKET.wake / MOTION_DT) && moment.phase !== 'awake'; step += 1) stepWorld(world, [], MOTION_DT);
        stepWorld(world, [], MOTION_DT);
        for (const echo of world.monsters.filter((monster: MonsterState): boolean => monster.alive)) {
          checked += 1;
          assert.ok(isWalkable(grid, echo.pos.x, echo.pos.z), `${def.id} at (${x}, ${z}): an echo woke in a sealed pocket at (${echo.pos.x.toFixed(2)}, ${echo.pos.z.toFixed(2)})`);
          assert.ok(joined(grid, echo.pos, moment.pos), `${def.id} at (${x}, ${z}): an echo at (${echo.pos.x.toFixed(2)}, ${echo.pos.z.toFixed(2)}) has no route into its bubble`);
        }
      }
    }
  }
  assert.ok(checked > 0);
});

void test('knocking a monster hard into any Hall prop never leaves it in a sealed pocket', (): void => {
  const world: World = worldIn(content, content.world.start, 2);
  world.monsters = [];
  world.wake = null;
  const grid: NavGrid = routedGrid(world.grid);
  for (const placed of world.zone.props) {
    const def = content.props.get(placed.prop);
    if (def === undefined || placed.when.length > 0) continue;
    const outlines: Blocker[] = propOutlines(def, placed.x, placed.z, placed.rotationDegrees);
    if (outlines.length === 0) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2]] as const) {
      let along: number = 0;
      while (along < 12 && Math.min(...outlines.map((outline: Blocker): number => blockerGap(outline, placed.x + dx * along, placed.z + dz * along))) < POCKET.knockFrom) along += POCKET.scan;
      const from: Vec2 = { x: placed.x + dx * along, z: placed.z + dz * along };
      if (!isWalkable(grid, from.x, from.z)) continue;
      world.monsters = [];
      const monster: MonsterState = spawn(world, 'mended', from);
      monster.pos = { ...from };
      monster.aggro = false;
      monster.knock = { x: -dx * POCKET.knockSpeed, z: -dz * POCKET.knockSpeed };
      for (let step: number = 0; step < Math.round(POCKET.knockSeconds / MOTION_DT); step += 1) stepWorld(world, [], MOTION_DT);
      assert.ok(isWalkable(grid, monster.pos.x, monster.pos.z), `${placed.prop} at (${placed.x}, ${placed.z}): a knock from (${from.x.toFixed(2)}, ${from.z.toFixed(2)}) left a monster sealed in at (${monster.pos.x.toFixed(2)}, ${monster.pos.z.toFixed(2)})`);
    }
  }
});

void test('a monster that ends up in a sealed pocket glides out to the nearest routed cell within a few seconds, never jumping', (): void => {
  const world: World = worldIn(content, content.world.start, 2);
  world.monsters = [];
  world.wake = null;
  const grid: NavGrid = routedGrid(world.grid);
  let pocket: Vec2 | null = null;
  for (let x: number = 0; x < world.grid.columns * world.grid.cellSize && pocket === null; x += POCKET.scan) {
    for (let z: number = 0; z < world.grid.rows * world.grid.cellSize && pocket === null; z += POCKET.scan) {
      if (isWalkable(world.grid, x, z) && !isWalkable(grid, x, z)) pocket = { x, z };
    }
  }
  const start: Vec2 = must(pocket, 'a spot open to the hero but not routed');
  const monster: MonsterState = spawn(world, 'mended', start);
  monster.pos = { ...start };
  monster.aggro = false;
  let previous: Vec2 = { ...monster.pos };
  for (let step: number = 0; step < Math.round(POCKET.strandSeconds / MOTION_DT); step += 1) {
    stepWorld(world, [], MOTION_DT);
    assert.ok(distance(previous, monster.pos) <= POCKET.strandSpeed * MOTION_DT + 1e-6, 'the stranded monster jumped');
    previous = { ...monster.pos };
  }
  assert.ok(isWalkable(grid, monster.pos.x, monster.pos.z), `it is still sealed in at (${monster.pos.x.toFixed(2)}, ${monster.pos.z.toFixed(2)})`);
});

const ROUND = {
  tallFrom: 1.5,
  gap: 3,
  bearings: 12,
  seconds: 3,
  heroSnap: 2,
  kinds: ['first_brute', 'unfinished_colossus'],
} as const;

void test('a monster chasing round any tall Hall prop or wall corner slides along it and never stops for a stuck rest', (): void => {
  const world: World = worldIn(content, content.world.start, 2);
  world.wake = null;
  world.moments = [];
  const stalls: string[] = [];
  for (const placed of world.zone.props) {
    const def = content.props.get(placed.prop);
    if (def === undefined || placed.when.length > 0 || def.height < ROUND.tallFrom) continue;
    for (const kind of ROUND.kinds) {
      for (let bearing: number = 0; bearing < ROUND.bearings; bearing += 1) {
        const angle: number = (bearing / ROUND.bearings) * Math.PI * 2;
        world.monsters = [];
        const hero: Vec2 | null = nearestWalkable(world.grid, { x: placed.x + Math.cos(angle) * ROUND.gap, z: placed.z + Math.sin(angle) * ROUND.gap }, ROUND.heroSnap);
        const from: Vec2 | null = nearestWalkable(routedGrid(world.grid), { x: placed.x - Math.cos(angle) * ROUND.gap, z: placed.z - Math.sin(angle) * ROUND.gap }, ROUND.heroSnap);
        if (hero === null || from === null) continue;
        world.player.pos = { ...hero };
        const chaser: MonsterState = spawn(world, kind, from);
        chaser.pos = { ...from };
        chaser.lastPos = { ...from };
        let rest: number = 0;
        for (let step: number = 0; step < Math.round(ROUND.seconds / MOTION_DT) && chaser.action === null; step += 1) {
          world.player.life = world.player.maxLife;
          world.player.pos = { ...hero };
          stepWorld(world, [], MOTION_DT);
          if (chaser.restTime > rest) stalls.push(`${kind} round ${placed.prop} (${placed.x}, ${placed.z}) at bearing ${bearing}, stopped at (${chaser.pos.x.toFixed(2)}, ${chaser.pos.z.toFixed(2)})`);
          rest = chaser.restTime;
        }
      }
    }
  }
  assert.deepEqual(stalls, []);
});

const FIRST_WALK = { seeds: 8, limit: 90, dt: 0.05, moveEvery: 5 } as const;

function echoFaction(world: World, monster: MonsterState): boolean {
  return monster.def.faction === world.content.moments.faction;
}

function roamers(world: World): MonsterState[] {
  return world.monsters.filter((monster: MonsterState): boolean => monster.alive && !echoFaction(world, monster));
}

function firstWalkCommands(world: World, tick: number): Command[] {
  const foe: MonsterState | undefined = world.monsters.filter((monster: MonsterState): boolean => monster.alive && monster.aggro && echoFaction(world, monster)).toSorted((a: MonsterState, b: MonsterState): number => distance(a.pos, world.player.pos) - distance(b.pos, world.player.pos))[0];
  if (foe !== undefined) return [{ type: 'skill', slot: 0, aim: foe.pos, targetId: foe.id }];
  if (choicesOpen(world)) return [{ type: 'respawn', choice: 'checkpoint' }];
  const target: ObjectiveTarget | null = objectiveTarget(world);
  return tick % FIRST_WALK.moveEvery === 0 && target !== null ? [{ type: 'move', held: false, dest: target.pos }] : [];
}

void test('a fresh hero walking the arrow from arrival to the first moment, dying there once, never comes within reach of a roaming pack until it is cleared', (): void => {
  const hall: ZoneDef = must(content.zones.get('hall_of_time'), 'hall');
  for (let seed: number = 1; seed <= FIRST_WALK.seeds; seed += 1) {
    const world: World = createWorld(content, { seed, save: null });
    enterZone(world, hall, { type: 'start' });
    world.player.invulnerable = Infinity;
    assert.ok(roamers(world).length > 0, `seed ${seed}: some packs stand in the Hall from the start`);
    let died: boolean = false;
    let exposed: boolean = false;
    let struck: boolean = false;
    let tick: number = 0;
    for (let elapsed: number = 0; elapsed < FIRST_WALK.limit && world.flags['first_moment'] !== 'cleared'; elapsed += FIRST_WALK.dt) {
      if (!exposed && world.moments.some((moment: MomentState): boolean => moment.phase === 'awake' && moment.entered)) {
        exposed = true;
        world.player.invulnerable = 0;
        world.player.life = 1;
        world.player.stats.lifeRegen = 0;
      }
      died = died || !world.player.alive;
      for (const event of stepWorld(world, firstWalkCommands(world, tick), FIRST_WALK.dt)) {
        if (event.type === 'moment_mark') struck = true;
        if (event.type === 'player_respawn') world.player.invulnerable = Infinity;
        const roused: MonsterState | undefined = event.type === 'aggro' ? world.monsters.find((monster: MonsterState): boolean => monster.id === event.monsterId) : undefined;
        if (roused !== undefined) assert.ok(echoFaction(world, roused), `seed ${seed}: ${roused.def.id} woke at ${elapsed.toFixed(1)} s`);
      }
      tick += 1;
      for (const roamer of roamers(world)) assert.ok(distance(roamer.pos, world.player.pos) > roamer.def.aggroRadius, `seed ${seed}: ${roamer.def.id} at ${roamer.pos.x.toFixed(1)},${roamer.pos.z.toFixed(1)} within reach of the hero at ${elapsed.toFixed(1)} s`);
    }
    assert.ok(struck && died, `seed ${seed}: the first moment struck and he died in it`);
    assert.equal(world.flags['first_moment'], 'cleared', `seed ${seed}`);
  }
});
