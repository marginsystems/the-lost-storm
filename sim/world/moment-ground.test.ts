import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { distance } from '../math.ts';
import type { Vec2 } from '../math.ts';
import { blockerGap, isWalkable } from '../nav/grid.ts';
import type { Blocker } from '../nav/grid.ts';
import { must, worldIn } from '../../test/support.ts';
import { createWorld } from './create.ts';
import { inSight, MOMENT_GROUND, momentBlockers, momentFootprint, tallBlockers } from './moment-ground.ts';
import { clearMoments, forceStrike, stepMoments } from './moments.ts';
import { setFlags } from './story.ts';
import { stepWorld } from './step.ts';
import type { MomentState, World } from './types.ts';
import { enterZone } from './zones.ts';

const GROUND = { step: 1 / 30, offset: 20, settle: 2 } as const;

function hallWorld(): { readonly world: World; readonly content: Content } {
  const content: Content = loadContent();
  const world: World = createWorld(content, { seed: 4, save: null });
  enterZone(world, must(content.zones.get('hall_of_time'), 'hall'), { type: 'start' });
  world.monsters = [];
  world.player.invulnerable = 1e9;
  return { world, content };
}

function settle(world: World): void {
  for (let elapsed: number = 0; elapsed < GROUND.settle; elapsed += GROUND.step) stepWorld(world, [], GROUND.step);
}

void test('a struck moment raises its props as colliders the hero cannot stand in, and lowers them when it is gone', (): void => {
  const { world } = hallWorld();
  const at: Vec2 = { x: world.player.pos.x + GROUND.offset, z: world.player.pos.z };
  assert.ok(isWalkable(world.grid, at.x, at.z));
  const moment: MomentState = must(forceStrike(world, at, 'first_fire'), 'a strike');
  assert.equal(moment.blocks, null);
  settle(world);
  assert.ok(momentBlockers(world, moment).length > 0);
  assert.notEqual(moment.blocks, null);
  assert.equal(isWalkable(world.grid, at.x, at.z), false);
  clearMoments(world);
  assert.equal(isWalkable(world.grid, at.x, at.z), true);
});

void test('a hero standing where a prop rises is moved to the nearest open ground', (): void => {
  const { world } = hallWorld();
  const at: Vec2 = { x: world.player.pos.x + GROUND.offset, z: world.player.pos.z };
  forceStrike(world, at, 'first_fire');
  world.player.pos = { x: at.x, z: at.z };
  world.player.path = [];
  settle(world);
  assert.ok(isWalkable(world.grid, world.player.pos.x, world.player.pos.z));
  assert.ok(distance(world.player.pos, at) > 0);
});

const SITES = { seeds: 30, rounds: 6, tick: 0.001 } as const;

void test('no strike lands with its bubble or its props over a prop of 1.5 m or taller, at the area sites or near the hero', (): void => {
  const content: Content = loadContent();
  const overlaps: string[] = [];
  let placed: number = 0;
  for (const [zoneId, zone] of content.zones) {
    if (zone.moments === null) continue;
    for (let seed: number = 1; seed <= SITES.seeds; seed += 1) {
      const world: World = worldIn(content, zoneId, seed);
      if (seed % 2 === 0) setFlags(world, content.moments.cleared);
      const tall: Blocker[] = tallBlockers(world);
      for (let round: number = 0; round < SITES.rounds; round += 1) {
        clearMoments(world);
        world.strikeTimer = 0;
        stepMoments(world, SITES.tick);
        for (const moment of world.moments) {
          placed += 1;
          const reach: number = momentFootprint(world, moment.def);
          const gap: number = Math.min(Infinity, ...tall.map((blocker: Blocker): number => blockerGap(blocker, moment.pos.x, moment.pos.z)));
          if (gap < reach) overlaps.push(`${zoneId} seed ${seed}: ${moment.def.id} at (${moment.pos.x.toFixed(1)}, ${moment.pos.z.toFixed(1)}) reaches ${reach.toFixed(1)} m but a tall prop is ${gap.toFixed(1)} m away`);
        }
      }
    }
  }
  assert.ok(placed >= SITES.seeds * SITES.rounds / 2, `only ${placed} strikes landed`);
  assert.deepEqual(overlaps, []);
});

const SIGHT = { seeds: 2, lattice: 2, sample: 0.1, landed: 0.8, side: 5 } as const;

function sightGap(tall: readonly Blocker[], from: Vec2, to: Vec2): number {
  const span: number = distance(from, to);
  let gap: number = Infinity;
  for (let along: number = MOMENT_GROUND.sightFrom; along <= span; along += SIGHT.sample) {
    const x: number = from.x + ((to.x - from.x) * along) / span;
    const z: number = from.z + ((to.z - from.z) * along) / span;
    for (const blocker of tall) gap = Math.min(gap, blockerGap(blocker, x, z));
  }
  return gap;
}

void test('wherever the hero stands when a first moment strikes beside him, no prop of 1.5 m or taller stands between him and the bubble centre', (): void => {
  const content: Content = loadContent();
  const hidden: string[] = [];
  let spots: number = 0;
  let placed: number = 0;
  for (const [zoneId, zone] of content.zones) {
    if (zone.moments === null || zone.moments.near === null) continue;
    for (let seed: number = 1; seed <= SIGHT.seeds; seed += 1) {
      const world: World = worldIn(content, zoneId, seed);
      world.monsters = [];
      const tall: Blocker[] = tallBlockers(world);
      const width: number = world.grid.columns * world.grid.cellSize;
      const depth: number = world.grid.rows * world.grid.cellSize;
      for (let x: number = 0; x <= width; x += SIGHT.lattice) {
        for (let z: number = 0; z <= depth; z += SIGHT.lattice) {
          if (!isWalkable(world.grid, x, z)) continue;
          spots += 1;
          world.player.pos = { x, z };
          clearMoments(world);
          world.strikeTimer = 0;
          stepMoments(world, SITES.tick);
          const moment: MomentState | undefined = world.moments[0];
          if (moment === undefined) continue;
          placed += 1;
          const gap: number = sightGap(tall, world.player.pos, moment.pos);
          if (gap < MOMENT_GROUND.sightMargin) hidden.push(`${zoneId} seed ${seed}: hero (${x}, ${z}) to ${moment.def.id} at (${moment.pos.x.toFixed(1)}, ${moment.pos.z.toFixed(1)}) passes ${gap.toFixed(2)} m from a tall prop`);
        }
      }
    }
  }
  assert.ok(spots > 0);
  assert.ok(placed >= spots * SIGHT.landed, `${placed} of ${spots} spots got a strike`);
  assert.deepEqual(hidden, []);
});

void test('the sight line to a strike is blocked by a tall prop that stands across it', (): void => {
  const { world } = hallWorld();
  const tall: Blocker[] = tallBlockers(world);
  assert.ok(tall.length > 0);
  for (const blocker of tall) {
    const points: readonly Vec2[] = blocker.kind === 'capsule' ? [blocker.from, blocker.to] : blocker.outline;
    const centre: Vec2 = { x: points.reduce((sum: number, point: Vec2): number => sum + point.x, 0) / points.length, z: points.reduce((sum: number, point: Vec2): number => sum + point.z, 0) / points.length };
    assert.equal(inSight(world, { x: centre.x - SIGHT.side, z: centre.z }, { x: centre.x + SIGHT.side, z: centre.z }), false, `(${centre.x.toFixed(1)}, ${centre.z.toFixed(1)})`);
  }
});
