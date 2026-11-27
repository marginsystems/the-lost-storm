import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dummy, shapeArena } from '../../test/shape-support.ts';
import type { Vec2 } from '../math.ts';
import { readyToRepeat } from './skills.ts';
import { stepWorld } from './step.ts';
import type { Command, World, WorldEvent } from './types.ts';

const DT: number = 1 / 60;
const DODGE_SLOT: number = 1;

function aimAhead(world: World, reach: number): Vec2 {
  return { x: world.player.pos.x + reach, z: world.player.pos.z };
}

function started(events: readonly WorldEvent[], id: string): boolean {
  return events.some((event: WorldEvent): boolean => event.type === 'skill_start' && event.skill.id === id);
}

for (const next of ['cleave_millwheel', 'firewall', 'cleave', 'storm_bolt', 'living_wire', 'cleave_heave']) {
  void test(`a buffered ${next} starts once on the Dodge Roll landing step, even when aimed back`, (): void => {
    const world: World = shapeArena([next, 'dodge_roll']);
    const aim: Vec2 = aimAhead(world, -5);
    stepWorld(world, [{ type: 'skill', slot: DODGE_SLOT, aim: aimAhead(world, 8), targetId: null }], DT);
    let starts: number = 0;
    for (let frame: number = 0; frame < 60; frame += 1) {
      const commands: Command[] = frame === 0 ? [{ type: 'hold', slot: 0, down: true }, { type: 'skill', slot: 0, aim, targetId: null }] : [];
      const before: number = world.player.pos.x;
      const events: WorldEvent[] = stepWorld(world, commands, DT);
      const landing: number = events.findIndex((event: WorldEvent): boolean => event.type === 'skill_impact' && event.skill.id === 'dodge_roll');
      if (landing >= 0) {
        assert.ok(events.slice(landing + 1).some((event: WorldEvent): boolean => event.type === 'skill_start' && event.skill.id === next));
        assert.equal(world.player.action?.phase, 'windup');
        assert.ok(world.player.action.direction.x < 0);
      } else assert.equal(started(events, next), false);
      if (started(events, next)) starts += 1;
      if (next === 'cleave_millwheel' && starts > 0 && landing < 0 && world.player.action?.phase === 'windup') assert.ok(world.player.pos.x < before);
    }
    assert.equal(starts, 1);
  });
}

for (const rate of [30, 60, 120]) {
  void test(`roll into Millwheel at ${rate} Hz covers the roll distance and only the remaining frame time at running speed`, (): void => {
    const world: World = shapeArena(['cleave_millwheel', 'dodge_roll']);
    const dash = world.player.skills[DODGE_SLOT]?.delivery;
    assert.ok(dash?.type === 'dash');
    const dt: number = 1 / rate;
    const from: number = world.player.pos.x;
    const aim: Vec2 = aimAhead(world, 12);
    stepWorld(world, [{ type: 'skill', slot: DODGE_SLOT, aim, targetId: null }], dt);
    let steps: number = 1;
    for (; steps < rate; steps += 1) {
      const commands: Command[] = steps === 1 ? [{ type: 'hold', slot: 0, down: true }, { type: 'skill', slot: 0, aim, targetId: null }] : [];
      if (started(stepWorld(world, commands, dt), 'cleave_millwheel')) break;
    }
    assert.ok(steps < rate);
    const left: number = (steps + 1) * dt - dash.duration;
    assert.ok(Math.abs(world.player.pos.x - from - dash.distance - left * world.player.stats.moveSpeed) < 1e-6);
  });
}

void test('a fresh skill press in roll recovery immediately starts a cast back toward a pursuer', (): void => {
  const world: World = shapeArena(['storm_bolt', 'dodge_roll']);
  stepWorld(world, [{ type: 'skill', slot: DODGE_SLOT, aim: aimAhead(world, 8), targetId: null }], DT);
  for (let step: number = 0; step < 60 && world.player.action?.phase === 'windup'; step += 1) stepWorld(world, [], DT);
  assert.equal(world.player.action?.phase, 'recovery');
  const events: WorldEvent[] = stepWorld(world, [{ type: 'skill', slot: 0, aim: aimAhead(world, -5), targetId: null }], DT);
  assert.ok(started(events, 'storm_bolt'));
  assert.ok(world.player.action.direction.x < 0);
});

void test('a held bolt can queue once during a roll and cannot repeat while that press waits', (): void => {
  const world: World = shapeArena(['storm_bolt', 'dodge_roll']);
  const bolt = world.player.skills[0];
  stepWorld(world, [{ type: 'skill', slot: DODGE_SLOT, aim: aimAhead(world, 8), targetId: null }], DT);
  assert.ok(readyToRepeat(world.player, bolt));
  stepWorld(world, [{ type: 'skill', slot: 0, aim: aimAhead(world, -5), targetId: null }], DT);
  assert.equal(readyToRepeat(world.player, bolt), false);
});

void test('a buffered Cleave chases an out-of-reach target from the roll landing without hitting early', (): void => {
  const world: World = shapeArena(['cleave', 'dodge_roll']);
  const target = dummy(world, aimAhead(world, -8));
  stepWorld(world, [{ type: 'skill', slot: DODGE_SLOT, aim: aimAhead(world, 8), targetId: null }], DT);
  const press: Command = { type: 'skill', slot: 0, aim: target.pos, targetId: target.id };
  for (let frame: number = 0; frame < 40; frame += 1) {
    const events: WorldEvent[] = stepWorld(world, frame === 0 ? [press] : [], DT);
    assert.equal(started(events, 'cleave'), false);
    if (world.player.intent.type === 'attack') {
      assert.equal(world.player.intent.targetId, target.id);
      assert.ok(world.player.path.length > 0);
      assert.ok(events.some((event: WorldEvent): boolean => event.type === 'skill_impact' && event.skill.id === 'dodge_roll'));
      return;
    }
  }
  assert.fail('never chased the target');
});

for (const id of ['firewall', 'living_wire']) {
  void test(`${id} can move sideways, steer its aim and stop walking while still attacking`, (): void => {
    const world: World = shapeArena([id]);
    const from: Vec2 = { ...world.player.pos };
    let pulses: number = 0;
    for (let frame: number = 0; frame < 30; frame += 1) {
      const aim: Vec2 = { x: world.player.pos.x + 5, z: world.player.pos.z + 0.08 * frame };
      const commands: Command[] = frame === 0 ? [{ type: 'walk', held: false, dest: { x: from.x, z: from.z + 5 } }, { type: 'hold', slot: 0, down: true }, { type: 'skill', slot: 0, aim, targetId: null }] : [{ type: 'steer', aim }];
      const events: WorldEvent[] = stepWorld(world, commands, DT);
      pulses += events.filter((event: WorldEvent): boolean => event.type === 'skill_impact' && event.skill.id === id).length;
      assert.ok((world.player.action?.direction.x ?? 0) > 0.8);
    }
    assert.ok(world.player.pos.z > from.z + 1);
    assert.equal(world.player.pos.x, from.x);
    assert.ok(pulses >= 2);
    if (id === 'firewall') assert.ok(world.areas.some((area): boolean => area.skill.id === 'firewall_segment' && area.pos.x > from.x + 3));
    const stopped: Vec2 = { ...world.player.pos };
    stepWorld(world, [{ type: 'stop' }, { type: 'steer', aim: aimAhead(world, 5) }], DT);
    assert.deepEqual(world.player.pos, stopped);
    assert.equal(world.player.action?.phase, 'channel');
  });
}
