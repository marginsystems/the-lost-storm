import assert from 'node:assert/strict';
import { isEmpty } from './press-buffer.ts';
import { test } from 'node:test';
import { faceAt } from '../../test/facing-support.ts';
import { must } from '../../test/support.ts';
import { shapeArena } from '../../test/shape-support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, SkillDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { refreshPlayer } from './character.ts';
import { dodgesAtOnce, givesWayToDodge, isDodge } from './dodge.ts';
import { stepWorld } from './step.ts';
import type { ActionState, Command, World, WorldEvent } from './types.ts';

const content: Content = loadContent();
const DT: number = 1 / 60;
const DODGES: readonly string[] = ['dodge_roll', 'dodge_roll_riptide', 'dodge_roll_shoulder', 'dodge_roll_slip'];
const DODGE_SLOT: number = 5;
const HELD_SKILLS: readonly string[] = ['cleave_millwheel', 'living_wire', 'cleave_heave', 'thunderhead'];

function skill(id: string): SkillDef {
  return must(content.skills.get(id), id);
}

function action(phase: ActionState['phase'], press: SkillDef): ActionState {
  return { skill: press, phase, timeLeft: 0.2, windup: 0.3, recovery: 0.2, direction: { x: 0, z: 1 }, target: null, travelSpeed: 0, travelLeft: 0, slot: 0, elapsed: 0, goal: null, turned: 0 , steeredAt: 0};
}

void test('every dodge on the bar is a dash or a step through, and no attack counts as a dodge', (): void => {
  for (const id of DODGES) assert.ok(isDodge(skill(id)), id);
  for (const id of ['cleave', ...HELD_SKILLS]) assert.equal(isDodge(skill(id)), false, id);
});

void test('a roll always goes at once; a step through goes at once only when it is not aimed at someone it may first have to walk to', (): void => {
  for (const id of ['dodge_roll', 'dodge_roll_riptide', 'dodge_roll_shoulder']) {
    assert.equal(dodgesAtOnce(skill(id), false), true, id);
    assert.equal(dodgesAtOnce(skill(id), true), true, id);
  }
  for (const id of ['dodge_roll_slip', 'mist_step', 'thunderhead_leap']) {
    assert.equal(dodgesAtOnce(skill(id), false), true, id);
    assert.equal(dodgesAtOnce(skill(id), true), false, id);
  }
  assert.equal(dodgesAtOnce(skill('cleave'), false), false);
});

void test('a dodge cuts a recovery, a running channel and a held charge, and waits for a committed windup or a released charge', (): void => {
  const charge: SkillDef = skill('cleave_heave');
  const plain: SkillDef = skill('cleave');
  assert.equal(givesWayToDodge(action('recovery', plain), false), true);
  assert.equal(givesWayToDodge(action('channel', skill('cleave_millwheel')), true), true);
  assert.equal(givesWayToDodge(action('channel', skill('cleave_millwheel')), false), true);
  assert.equal(givesWayToDodge(action('windup', charge), true), true);
  assert.equal(givesWayToDodge(action('windup', charge), false), false);
  assert.equal(givesWayToDodge(action('windup', plain), true), false);
  assert.equal(givesWayToDodge(action('windup', plain), false), false);
});

function holder(held: string, dodge: string): World {
  const world: World = shapeArena([]);
  world.player.learned.push(held, dodge);
  world.player.bar = [held, null, null, null, null, dodge];
  refreshPlayer(world);
  world.player.mana = world.player.stats.maxMana;
  faceAt(world.player, aimAhead(world, 1));
  return world;
}

function aimAhead(world: World, reach: number): Vec2 {
  return { x: world.player.pos.x + reach, z: world.player.pos.z };
}

function holdFor(world: World, seconds: number): void {
  const aim: Vec2 = aimAhead(world, 4);
  stepWorld(world, [{ type: 'hold', slot: 0, down: true }, { type: 'skill', slot: 0, aim, targetId: null }], DT);
  for (let step: number = 1; step < Math.round(seconds / DT); step += 1) {
    world.player.mana = world.player.stats.maxMana;
    stepWorld(world, [{ type: 'steer', aim }], DT);
  }
}

function started(events: readonly WorldEvent[], id: string): boolean {
  return events.some((event: WorldEvent): boolean => event.type === 'skill_start' && event.skill.id === id);
}

for (const held of HELD_SKILLS) {
  for (const dodge of DODGES) {
    void test(`${dodge} pressed while ${held} is held starts on that very step and ends the held skill`, (): void => {
      const world: World = holder(held, dodge);
      holdFor(world, 0.5);
      const before: ActionState | null = world.player.action;
      assert.notEqual(before, null, `${held} is not running`);
      const press: Command = { type: 'skill', slot: DODGE_SLOT, aim: aimAhead(world, 6), targetId: null };
      const events: WorldEvent[] = stepWorld(world, [press], DT);
      assert.ok(started(events, dodge), `${dodge} did not start on the step it was pressed`);
      assert.equal(world.player.action?.skill.id, dodge);
      assert.ok(isEmpty(world.player.buffered));
    });
  }
}

void test('a dodge pressed in the windup of a committed swing waits for the swing to land, then starts once', (): void => {
  const world: World = holder('cleave', 'dodge_roll');
  stepWorld(world, [{ type: 'skill', slot: 0, aim: aimAhead(world, 2), targetId: null }], DT);
  assert.equal(world.player.action?.phase, 'windup');
  const events: WorldEvent[] = stepWorld(world, [{ type: 'skill', slot: DODGE_SLOT, aim: aimAhead(world, 6), targetId: null }], DT);
  assert.equal(started(events, 'dodge_roll'), false);
  let starts: number = 0;
  let landed: boolean = false;
  for (let step: number = 0; step < 120; step += 1) {
    const later: WorldEvent[] = stepWorld(world, [], DT);
    landed ||= later.some((event: WorldEvent): boolean => event.type === 'skill_impact' && event.skill.id.startsWith('cleave'));
    if (!started(later, 'dodge_roll')) continue;
    starts += 1;
    assert.ok(landed, 'the dodge started before the swing landed');
  }
  assert.equal(starts, 1);
});
