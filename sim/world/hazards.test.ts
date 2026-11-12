import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, arena, place } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import { distance } from '../math.ts';
import { applyHit, offenceOf } from './combat.ts';
import { clearHazards, stepHazards } from './hazards.ts';
import { stepWorld } from './step.ts';
import type { HazardState, MonsterState, World, WorldEvent } from './types.ts';

const DT: number = 1 / 60;

function run(world: World, seconds: number, hold: () => void = (): void => undefined): WorldEvent[] {
  const seen: WorldEvent[] = [];
  for (let step: number = 0; step < Math.round(seconds / DT); step += 1) {
    hold();
    seen.push(...stepWorld(world, [], DT));
  }
  return seen;
}

function marks(events: readonly WorldEvent[], burst: boolean): HazardState[] {
  return events.flatMap((event: WorldEvent): HazardState[] => (event.type === 'hazard' && event.burst === burst ? [event.hazard] : []));
}

void test('a caster marks the ground where the hero stands and the mark bursts only after its delay', (): void => {
  const world: World = arena(1);
  const caller: MonsterState = place(world, 'test_caller', { x: ARENA_CENTRE.x + 8, z: ARENA_CENTRE.z });
  const hero = world.player;
  const events: WorldEvent[] = run(world, 0.45, (): void => {
    hero.pos = { ...ARENA_CENTRE };
  });
  const placed: HazardState | undefined = marks(events, false)[0];
  assert.ok(placed !== undefined, 'a mark was placed');
  assert.ok(distance(placed.pos, ARENA_CENTRE) < 0.5, 'the mark sits under the hero');
  assert.equal(placed.ownerId, caller.id);
  const life: number = hero.life;
  const before: WorldEvent[] = run(world, placed.delay - 0.1, (): void => {
    hero.pos = { ...ARENA_CENTRE };
  });
  assert.equal(marks(before, true).length, 0, 'no burst before the delay is over');
  assert.equal(hero.life, life);
  const after: WorldEvent[] = run(world, 0.2, (): void => {
    hero.pos = { ...ARENA_CENTRE };
  });
  assert.equal(marks(after, true).length, 1);
  assert.ok(hero.life < life, 'a hero who stays in the circle is hit');
});

void test('a hero who walks out of the mark before it bursts takes nothing', (): void => {
  const world: World = arena(2);
  place(world, 'test_caller', { x: ARENA_CENTRE.x + 8, z: ARENA_CENTRE.z });
  const hero = world.player;
  run(world, 0.45, (): void => {
    hero.pos = { ...ARENA_CENTRE };
  });
  assert.equal(world.hazards.length, 1);
  const life: number = hero.life;
  const events: WorldEvent[] = run(world, 1.3, (): void => {
    hero.pos = { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z - 6 };
  });
  const burst = events.find((event: WorldEvent): boolean => event.type === 'hazard' && event.burst);
  assert.ok(burst !== undefined && burst.type === 'hazard');
  assert.equal(burst.hits, 0);
  assert.equal(hero.life, life);
});

void test('a burst on a warded hero counts no hit', (): void => {
  const world: World = arena(2);
  place(world, 'test_caller', { x: ARENA_CENTRE.x + 8, z: ARENA_CENTRE.z });
  const hero = world.player;
  run(world, 0.45, (): void => {
    hero.pos = { ...ARENA_CENTRE };
  });
  assert.equal(world.hazards.length, 1);
  const life: number = hero.life;
  const events: WorldEvent[] = run(world, 1.3, (): void => {
    hero.pos = { ...ARENA_CENTRE };
    hero.invulnerable = 1;
  });
  const burst = events.find((event: WorldEvent): boolean => event.type === 'hazard' && event.burst);
  assert.ok(burst !== undefined && burst.type === 'hazard');
  assert.equal(burst.hits, 0);
  assert.equal(hero.life, life);
});

void test('a volatile elite leaves a burst where it fell, and it goes off after its delay', (): void => {
  const world: World = arena(3);
  const thrall: MonsterState = place(world, 'mended', { x: ARENA_CENTRE.x + 2, z: ARENA_CENTRE.z }, ['test_volatile']);
  assert.equal(thrall.def.deathSkill, 'test_burst');
  thrall.life = 1;
  applyHit(world, offenceOf(world.player), thrall, must(world.player.skills[0], 'basic attack'), { x: 1, z: 0 });
  stepHazards(world, DT);
  const placed: HazardState | undefined = world.hazards[0];
  assert.ok(placed !== undefined, 'the corpse left a mark');
  assert.ok(distance(placed.pos, thrall.pos) < 0.01);
  assert.equal(placed.team, 'monster');
  const life: number = world.player.life;
  const burst: WorldEvent[] = run(world, placed.delay, (): void => {
    world.player.pos = { x: placed.pos.x - 1, z: placed.pos.z };
  });
  assert.equal(marks(burst, true).length, 1);
  assert.ok(world.player.life < life);
});

void test('clearing hazards forgets every mark', (): void => {
  const world: World = arena(4);
  place(world, 'test_caller', { x: ARENA_CENTRE.x + 8, z: ARENA_CENTRE.z });
  run(world, 0.45);
  assert.equal(world.hazards.length, 1);
  clearHazards(world);
  assert.deepEqual(world.hazards, []);
});
