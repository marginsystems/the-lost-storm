import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MotionSample, TestScene } from '../../test/motion-support.ts';
import { MOTION_DT, motionProblems, placedProp, sampleOf, sceneZone } from '../../test/motion-support.ts';
import { worldIn, zoneOf } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { isWalkable } from '../nav/grid.ts';
import { stepWorld } from './step.ts';
import type { Command, World } from './types.ts';
import { enterZone } from './zones.ts';

const content: Content = loadContent();
const base: ZoneDef = zoneOf(content, 'drowned_bastion');

const LIMITS = {
  turnRate: 18,
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
  const world: World = worldIn(content, base.id, 5);
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
