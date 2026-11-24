import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, arena, place } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import type { SkillDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { applyHit, offenceOf } from './combat.ts';
import { mendAmount } from './heal.ts';
import { stepWorld } from './step.ts';
import type { MonsterState, World, WorldEvent } from './types.ts';

const DT: number = 1 / 60;
const HEAL: string = 'echo_healing_pulse';

function at(x: number, z: number): Vec2 {
  return { x: ARENA_CENTRE.x + x, z: ARENA_CENTRE.z + z };
}

function fight(): { readonly world: World; readonly healer: MonsterState; readonly ally: MonsterState } {
  const world: World = arena(17);
  const healer: MonsterState = place(world, 'echo_healer', at(0, 5));
  const ally: MonsterState = place(world, 'unfinished_taker', at(2, 4));
  ally.stagger = 4;
  world.player.pos = at(0, 0);
  return { world, healer, ally };
}

function run(world: World, frames: number): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let frame: number = 0; frame < frames; frame += 1) events.push(...stepWorld(world, [], DT));
  return events;
}

void test('an Echo Healer restores nearby wounded allies after a full windup', (): void => {
  const { world, healer, ally } = fight();
  const distant: MonsterState = place(world, 'unfinished_taker', at(-8, 5));
  distant.life = 1;
  distant.stagger = 4;
  const pulse: SkillDef = must(world.content.skills.get(HEAL), HEAL);
  const amount: number = mendAmount(must(pulse.mend, 'Echo Healing Pulse mend'), ally);
  ally.life = ally.maxLife - amount;
  const before: number = ally.life;
  world.player.life = 3;
  assert.ok(run(world, 1).some((event: WorldEvent): boolean => event.type === 'skill_start' && event.actorId === healer.id && event.skill.id === HEAL));
  assert.equal(healer.action?.phase, 'windup');
  const windupFrames: number = Math.floor(pulse.windup / DT);
  assert.ok(run(world, windupFrames - 1).every((event: WorldEvent): boolean => event.type !== 'heal'));
  assert.equal(ally.life, before);
  const healed: WorldEvent[] = run(world, 3).filter((event: WorldEvent): boolean => event.type === 'heal');
  assert.deepEqual(healed, [{ type: 'heal', sourceId: healer.id, targetId: ally.id, amount, wanted: amount, skill: pulse, pos: ally.pos }]);
  assert.equal(ally.life, ally.maxLife);
  assert.equal(distant.life, 1);
});

void test('an Echo Healer saves its pulse when only full, lightly wounded, sealed, or fallen allies are nearby', (): void => {
  const { world, healer, ally } = fight();
  const fallen: MonsterState = place(world, 'unfinished_taker', at(-2, 4));
  fallen.alive = false;
  fallen.life = 0;
  const sealed: MonsterState = place(world, 'unfinished_taker', at(3, 5));
  sealed.sealed = true;
  sealed.life = 1;
  const full: MonsterState = place(world, 'unfinished_taker', at(-3, 5));
  full.stagger = 4;
  ally.life = ally.maxLife - 1;
  healer.life = 1;
  world.player.life = 3;
  assert.ok(run(world, 100).every((event: WorldEvent): boolean => event.type !== 'skill_start' || event.skill.id !== HEAL));
  assert.equal(ally.life, ally.maxLife - 1);
  assert.equal(sealed.life, 1);
  assert.equal(full.life, full.maxLife);
});

void test('a stagger during the healing windup cancels the pulse', (): void => {
  const { world, healer, ally } = fight();
  ally.life = 1;
  run(world, 1);
  assert.equal(healer.action?.skill.id, HEAL);
  const thunderclap: SkillDef = must(world.content.skills.get('thunderclap'), 'Thunderclap');
  applyHit(world, offenceOf(world.player), healer, thunderclap, { x: 0, z: 1 });
  assert.ok(healer.alive);
  assert.ok(world.events.some((event: WorldEvent): boolean => event.type === 'skill_interrupt' && event.actorId === healer.id));
  assert.equal(healer.action, null);
  assert.ok(run(world, 90).every((event: WorldEvent): boolean => event.type !== 'heal'));
  assert.equal(ally.life, 1);
});
