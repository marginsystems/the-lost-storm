import assert from 'node:assert/strict';
import { test } from 'node:test';
import { faceAt } from '../../test/facing-support.ts';
import { must } from '../../test/support.ts';
import { shapeArena } from '../../test/shape-support.ts';
import { loadContent } from '../content/content.ts';
import type { SkillTrail } from '../content/combat-types.ts';
import type { Content, SkillDef } from '../content/types.ts';
import { distance } from '../math.ts';
import type { Vec2 } from '../math.ts';
import { refreshPlayer } from './character.ts';
import { stepWorld } from './step.ts';
import type { AreaState, World } from './types.ts';

const content: Content = loadContent();
const DT: number = 1 / 60;
const WHEEL: SkillDef = must(content.skills.get('cleave_firewheel'), 'firewheel');
const TRAIL: SkillTrail = must(WHEEL.trail ?? undefined, 'firewheel trail');

function wheeler(held: string): World {
  const world: World = shapeArena([]);
  world.player.learned.push(held);
  world.player.bar = [held, null, null, null, null, null];
  refreshPlayer(world);
  world.player.mana = world.player.stats.maxMana;
  faceAt(world.player, ahead(world, 1));
  return world;
}

function ahead(world: World, reach: number): Vec2 {
  return { x: world.player.pos.x + reach, z: world.player.pos.z };
}

function hold(world: World, seconds: number, run: boolean): void {
  const spot: Vec2 = ahead(world, 0.05);
  stepWorld(world, [{ type: 'hold', slot: 0, down: true }, { type: 'skill', slot: 0, aim: run ? ahead(world, 4) : spot, targetId: null }], DT);
  for (let step: number = 0; step < Math.round(seconds / DT); step += 1) {
    world.player.mana = world.player.stats.maxMana;
    stepWorld(world, [{ type: 'steer', aim: run ? ahead(world, 4) : spot }], DT);
  }
}

function patches(world: World): AreaState[] {
  return world.areas.filter((area: AreaState): boolean => area.skill.id === TRAIL.skill && area.ownerId === world.player.id);
}

void test('the Firewheel lays its trail on the ground, a lasting area that leaves nothing itself', (): void => {
  const left: SkillDef = must(content.skills.get(TRAIL.skill), TRAIL.skill);
  assert.equal(WHEEL.press?.type, 'channel');
  assert.equal(left.delivery.type === 'area' ? left.delivery.anchor : null, 'ground');
  assert.equal(left.leaves, null);
  assert.equal(left.trail, null);
});

void test('turning the Firewheel on the spot keeps one patch burning under the hero, never a pile', (): void => {
  const world: World = wheeler('cleave_firewheel');
  const start: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  hold(world, 1, false);
  assert.ok(distance(start, world.player.pos) < TRAIL.every, 'the hero stayed put');
  assert.equal(patches(world).length, 1);
});

void test('running with the Firewheel lays a line of burning patches behind the hero, spaced apart and capped', (): void => {
  const world: World = wheeler('cleave_firewheel');
  const start: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  hold(world, 1.5, true);
  assert.ok(distance(start, world.player.pos) > TRAIL.every * 3, 'the hero ran while turning');
  const laid: AreaState[] = patches(world);
  assert.ok(laid.length >= 3 && laid.length <= TRAIL.limit, `laid ${laid.length}`);
  for (const [index, area] of laid.entries()) {
    for (const other of laid.slice(index + 1)) assert.ok(distance(area.pos, other.pos) >= TRAIL.every - 1e-6);
  }
});

void test('a channel with no trail lays nothing on the ground', (): void => {
  const world: World = wheeler('cleave_millwheel');
  hold(world, 1.5, true);
  assert.equal(world.areas.filter((area: AreaState): boolean => area.ownerId === world.player.id).length, 0);
});
