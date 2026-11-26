import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, arena, place } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import type { ReviveDelivery } from '../content/combat-types.ts';
import type { BossDef, BossPhase, SkillDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { canPay, raiseFallen, revivable } from './revive.ts';
import { stepWorld } from './step.ts';
import type { MonsterState, World, WorldEvent } from './types.ts';

const DT: number = 1 / 60;

function at(x: number, z: number): Vec2 {
  return { x: ARENA_CENTRE.x + x, z: ARENA_CENTRE.z + z };
}

function revive(world: World, id: string): ReviveDelivery {
  const skill: SkillDef = must(world.content.skills.get(id), id);
  if (skill.delivery.type !== 'revive') throw new Error(`${id} does not revive`);
  return skill.delivery;
}

function fallen(world: World, id: string, pos: Vec2): MonsterState {
  const body: MonsterState = place(world, id, pos);
  body.alive = false;
  body.life = 0;
  body.deadTime = 1;
  return body;
}

void test('a Patchwright raises a fallen monster of any kind and pays for each body with its own life', (): void => {
  const world: World = arena(31);
  const patchwright: MonsterState = place(world, 'patchwright', at(0, 4));
  const spider: MonsterState = fallen(world, 'spider', at(1, 4));
  const rank: MonsterState = fallen(world, 'timekeeper_rank', at(-1, 4));
  const delivery: ReviveDelivery = revive(world, 'patchwright_raise');
  assert.equal(delivery.raises, 'any');
  const before: number = patchwright.life;
  const raised: number = raiseFallen(world, patchwright.id, patchwright.def.faction, delivery, patchwright.pos);
  assert.equal(raised, 2);
  assert.equal(patchwright.life, before - 2 * Math.ceil(patchwright.maxLife * delivery.cost));
  const standing: string[] = world.monsters.filter((monster: MonsterState): boolean => monster.alive && monster.revived).map((monster: MonsterState): string => monster.def.id).toSorted();
  assert.deepEqual(standing, ['spider', 'timekeeper_rank']);
  assert.ok(!world.monsters.includes(spider) && !world.monsters.includes(rank));
});

void test('a kin reviver raises only its own faction', (): void => {
  const world: World = arena(32);
  const mender: MonsterState = place(world, 'mender', at(0, 4));
  fallen(world, 'spider', at(1, 4));
  const kin: MonsterState = fallen(world, 'mended', at(-1, 4));
  const delivery: ReviveDelivery = revive(world, 'mender_stitch');
  assert.equal(delivery.raises, 'kin');
  assert.deepEqual(revivable(world, mender.def.faction, delivery, mender.pos), [kin]);
});

void test('a Patchwright too worn to pay raises nothing and never casts its raise', (): void => {
  const world: World = arena(33);
  const patchwright: MonsterState = place(world, 'patchwright', at(0, 5));
  fallen(world, 'mended', at(1, 5));
  const delivery: ReviveDelivery = revive(world, 'patchwright_raise');
  patchwright.life = Math.ceil(patchwright.maxLife * delivery.cost);
  assert.equal(canPay(patchwright, delivery), false);
  assert.equal(raiseFallen(world, patchwright.id, patchwright.def.faction, delivery, patchwright.pos), 0);
  world.player.pos = at(0, 0);
  const events: WorldEvent[] = [];
  for (let frame: number = 0; frame < 120; frame += 1) events.push(...stepWorld(world, [], DT));
  assert.ok(events.every((event: WorldEvent): boolean => event.type !== 'skill_start' || event.skill.id !== 'patchwright_raise'));
});

void test('the Loom sews back more of the fallen in each later phase', (): void => {
  const world: World = arena(34);
  const loom: MonsterState = place(world, 'the_loom', at(0, 6));
  const boss: BossDef = must(loom.def.boss, 'the Loom is a boss');
  assert.deepEqual(boss.phases.map((phase: BossPhase): string | null => phase.support), [null, 'loom_sew', 'loom_sew_all']);
  const counts: number[] = [loom.def.support ?? '', 'loom_sew', 'loom_sew_all'].map((id: string): number => revive(world, id).count);
  assert.ok(counts.every((count: number, index: number): boolean => index === 0 || count > (counts[index - 1] ?? 0)));
  for (const offset of [-2, -1, 1, 2]) fallen(world, 'needle_thrower', at(offset, 6));
  loom.life = loom.maxLife * 0.5;
  loom.aggro = true;
  world.player.pos = at(0, 0);
  const events: WorldEvent[] = [];
  for (let frame: number = 0; frame < 30; frame += 1) events.push(...stepWorld(world, [], DT));
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'skill_start' && event.actorId === loom.id && event.skill.id === 'loom_sew'));
});
