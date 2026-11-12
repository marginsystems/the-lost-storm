import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MotionSample, TestScene } from '../../test/motion-support.ts';
import { MOTION_DT, motionProblems, placedProp, sampleOf, sceneZone } from '../../test/motion-support.ts';
import { ARENA_CENTRE, arena, place } from '../../test/arena-support.ts';
import { must, worldIn, zoneOf } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { isWalkable, lineOfSight, nearestWalkable } from '../nav/grid.ts';
import { spawnPacks } from './monsters.ts';
import { stepWorld } from './step.ts';
import type { Command, MonsterState, World } from './types.ts';
import { enterZone } from './zones.ts';

const content: Content = loadContent();
const base: ZoneDef = zoneOf(content, 'drowned_bastion');

const LIMITS = {
  turnRate: 12,
  engageSlack: 1.6,
  settleTime: 2,
  seconds: 10,
  paceEvery: 1.5,
  blockedSeconds: 3,
  pinnedRunTime: 0.15,
  flickerGap: 0.3,
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
  monster.pos = must(nearestWalkable(world.grid, at, 6), 'walkable spawn');
  monster.lastPos = { x: monster.pos.x, z: monster.pos.z };
  monster.spawnTime = 0;
  monster.aggro = true;
  return monster;
}

function build(scene: Scene, kind: string): World {
  const world: World = worldIn(content, base.id, 7);
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
  const world: World = worldIn(content, base.id, 3);
  enterZone(world, sceneZone(base, 'test_blocked', { tiles: OPEN, props: [], start: { x: 4, z: 14 } }), { type: 'start' });
  world.monsters = [];
  const caster: MonsterState = spawn(world, 'mender', { x: 1.2, z: 14 });
  caster.stance = 'retreat';
  const samples: MotionSample[] = [];
  for (let step: number = 0; step < Math.round(LIMITS.blockedSeconds / MOTION_DT); step += 1) {
    world.player.life = world.player.maxLife;
    caster.cooldowns = { [caster.def.skill]: LIMITS.blockedSeconds };
    stepWorld(world, [], MOTION_DT);
    samples.push(sampleOf(caster, false));
  }
  assert.deepEqual(motionProblems('caster', samples, LIMITS.turnRate), []);
  assert.notEqual(caster.stance, 'retreat');
});

void test('a monster pinned against a prop stops its run within a tenth of a second', (): void => {
  const world: World = worldIn(content, base.id, 4);
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
    const wanted: number = step * MOTION_DT < 3 ? retreat - 0.5 + wobble : retreat + 2 + wobble;
    world.player.pos = { x: caller.pos.x - (toward.x / gap) * wanted, z: caller.pos.z - (toward.z / gap) * wanted };
    stepWorld(world, [], MOTION_DT);
    if (caller.stance === 'retreat') retreated = true;
    if (caller.stance !== stance) switches.push(step * MOTION_DT);
    stance = caller.stance;
  }
  assert.ok(retreated, 'it backed off');
  const flickers: number[] = switches.filter((at: number, index: number): boolean => at > LIMITS.settleTime / 4 && index > 0 && at - (switches[index - 1] ?? 0) < LIMITS.flickerGap);
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
