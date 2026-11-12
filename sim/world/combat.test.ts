import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, ARENA_CONTENT, arena, place } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import type { SkillDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { applyHit, guardOutcome, offenceOf } from './combat.ts';
import { stepWorld } from './step.ts';
import type { MonsterState, World, WorldEvent } from './types.ts';

const DT: number = 1 / 60;
const light: SkillDef = must(ARENA_CONTENT.skills.get('mended_rhythm'), 'light');
const heavy: SkillDef = must(ARENA_CONTENT.skills.get('test_heavy'), 'heavy');
const grab: SkillDef = must(ARENA_CONTENT.skills.get('test_grab'), 'grab');

function brute(world: World): MonsterState {
  const monster: MonsterState = place(world, 'test_brute', { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z + 3 });
  monster.facing = Math.atan2(world.player.pos.x - monster.pos.x, world.player.pos.z - monster.pos.z);
  return monster;
}

function toward(from: Vec2, to: Vec2): Vec2 {
  const gap: number = distance(from, to);
  return { x: (to.x - from.x) / gap, z: (to.z - from.z) / gap };
}

void test('a shielded brute blocks a light hit from the front: little damage, no stagger, a guarded event', (): void => {
  const world: World = arena(1);
  const target: MonsterState = brute(world);
  const front: Vec2 = toward(world.player.pos, target.pos);
  assert.equal(guardOutcome(target, light, front), 'blocked');
  const life: number = target.life;
  applyHit(world, { ...offenceOf(world.player), critChance: 0 }, target, light, front);
  const blocked: number = life - target.life;
  assert.equal(target.stagger, 0);
  assert.ok(world.events.some((event: WorldEvent): boolean => event.type === 'guarded' && !event.broken));
  const behind: World = arena(1);
  const flank: MonsterState = brute(behind);
  const flankLife: number = flank.life;
  applyHit(behind, { ...offenceOf(behind.player), critChance: 0 }, flank, light, { x: -front.x, z: -front.z });
  assert.ok(flankLife - flank.life > blocked * 2, `a hit from behind lands in full (${flankLife - flank.life} against ${blocked})`);
});

void test('the guard opens from behind, while the brute is staggered, and in the recovery after its slam', (): void => {
  const world: World = arena(2);
  const target: MonsterState = brute(world);
  const front: Vec2 = toward(world.player.pos, target.pos);
  assert.equal(guardOutcome(target, light, { x: -front.x, z: -front.z }), 'open');
  assert.equal(guardOutcome(target, light, { x: front.z, z: -front.x }), 'open');
  target.stagger = 0.5;
  assert.equal(guardOutcome(target, light, front), 'open');
  target.stagger = 0;
  target.action = { skill: must(ARENA_CONTENT.skills.get('test_slam'), 'slam'), phase: 'recovery', timeLeft: 0.5, windup: 1, recovery: 1, direction: front, target: null, travelSpeed: 0, travelLeft: 0 };
  assert.equal(guardOutcome(target, light, front), 'open');
  target.action = { ...target.action, phase: 'windup' };
  assert.equal(guardOutcome(target, light, front), 'blocked');
});

void test('a heavy hit breaks the guard and staggers the brute for its break time', (): void => {
  const world: World = arena(3);
  const target: MonsterState = brute(world);
  const front: Vec2 = toward(world.player.pos, target.pos);
  assert.equal(guardOutcome(target, heavy, front), 'broken');
  applyHit(world, offenceOf(world.player), target, heavy, front);
  assert.equal(target.stagger, must(target.def.guard, 'guard').breakTime);
  assert.ok(world.events.some((event: WorldEvent): boolean => event.type === 'guarded' && event.broken));
});

void test('a grab roots the hero in place for its root time, then the hero walks on', (): void => {
  const world: World = arena(4);
  const shambler: MonsterState = place(world, 'test_shambler', { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z + 1.4 });
  applyHit(world, offenceOf(shambler), world.player, grab, { x: 0, z: -1 });
  assert.equal(world.player.root, grab.root);
  const start: Vec2 = { ...world.player.pos };
  shambler.alive = false;
  stepWorld(world, [{ type: 'move', dest: { x: ARENA_CENTRE.x - 8, z: ARENA_CENTRE.z }, held: false }], DT);
  for (let step: number = 0; step < Math.round((grab.root - 0.1) / DT); step += 1) stepWorld(world, [], DT);
  assert.ok(distance(start, world.player.pos) < 0.05, 'the hero stayed put while rooted');
  for (let step: number = 0; step < Math.round(0.5 / DT); step += 1) stepWorld(world, [], DT);
  assert.ok(distance(start, world.player.pos) > 1, 'the hero walks on once the root ends');
});

void test('a grab never roots a monster, and a hit on a warded hero does not land', (): void => {
  const world: World = arena(4);
  const shambler: MonsterState = place(world, 'test_shambler', { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z + 1.4 });
  assert.equal(applyHit(world, offenceOf(world.player), shambler, grab, { x: 0, z: 1 }), true);
  assert.equal(shambler.root, 0);
  world.player.invulnerable = 1;
  assert.equal(applyHit(world, offenceOf(shambler), world.player, grab, { x: 0, z: -1 }), false);
  assert.equal(world.player.root, 0);
});

void test('poise scales the knockback a monster takes', (): void => {
  const world: World = arena(5);
  const steady: MonsterState = place(world, 'test_shambler', { x: ARENA_CENTRE.x + 3, z: ARENA_CENTRE.z });
  const loose: MonsterState = place(world, 'mended', { x: ARENA_CENTRE.x - 3, z: ARENA_CENTRE.z });
  applyHit(world, offenceOf(world.player), steady, light, { x: 1, z: 0 });
  applyHit(world, offenceOf(world.player), loose, light, { x: -1, z: 0 });
  assert.ok(Math.abs(steady.knock.x) < Math.abs(loose.knock.x) * 0.5);
});
