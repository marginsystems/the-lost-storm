import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MotionSample, TestScene } from '../../test/motion-support.ts';
import { MOTION_DT, motionProblems, placedProp, sampleOf, sceneZone } from '../../test/motion-support.ts';
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

const KINDS: readonly string[] = ['bone_thrall', 'hex_caller', 'one_before', 'mason', 'hodman'];

function spawn(world: World, kind: string, at: Vec2): MonsterState {
  world.zone = { ...world.zone, packs: [{ x: at.x, z: at.z, members: [{ monster: kind, count: 1 }], when: [] }] };
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
  const caster: MonsterState = spawn(world, 'hex_caller', { x: 1.2, z: 14 });
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
