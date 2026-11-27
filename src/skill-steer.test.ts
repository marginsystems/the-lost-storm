import assert from 'node:assert/strict';
import test from 'node:test';
import type { SkillDef } from '../sim/content/types.ts';
import type { Vec2 } from '../sim/math.ts';
import { stepWorld } from '../sim/world/step.ts';
import type { World } from '../sim/world/types.ts';
import { arena } from '../test/arena-support.ts';
import { faceAt } from '../test/facing-support.ts';
import { at, DT, inputContent, rig, screenOf } from '../test/input-support.ts';
import type { Rig } from '../test/input-support.ts';
import type { MoveKeys } from './move-keys.ts';
import { keysDirection } from './move-keys.ts';
import { CAMERA } from './render/iso-camera.ts';
import type { SlotDefault } from './settings/bindings.ts';
import type { HeroMotion } from './skill-steer.ts';
import { heroMotion, motionAim, SKILL_STEER } from './skill-steer.ts';

const STEER = { seed: 7, slot: 1, cursor: { x: 4, z: 1.5 }, carry: 1, settle: 1.6, along: 1, still: 0.35, sideways: 0.5 } as const;

const SLOTS: readonly SlotDefault[] = [
  { name: 'Left', bindings: ['mouse_left'] },
  { name: 'Moves', bindings: ['KeyQ'] },
];

const YAW: number = (CAMERA.yawDegrees * Math.PI) / 180;

interface Way {
  readonly name: string;
  readonly codes: readonly string[];
  readonly keys: MoveKeys;
}

const NONE: MoveKeys = { up: false, down: false, left: false, right: false };

const WAYS: readonly Way[] = [
  { name: 'none', codes: [], keys: NONE },
  { name: 'up', codes: ['KeyW'], keys: { ...NONE, up: true } },
  { name: 'down', codes: ['KeyS'], keys: { ...NONE, down: true } },
  { name: 'left', codes: ['KeyA'], keys: { ...NONE, left: true } },
  { name: 'right', codes: ['KeyD'], keys: { ...NONE, right: true } },
  { name: 'up-left', codes: ['KeyW', 'KeyA'], keys: { ...NONE, up: true, left: true } },
  { name: 'up-right', codes: ['KeyW', 'KeyD'], keys: { ...NONE, up: true, right: true } },
  { name: 'down-left', codes: ['KeyS', 'KeyA'], keys: { ...NONE, down: true, left: true } },
  { name: 'down-right', codes: ['KeyS', 'KeyD'], keys: { ...NONE, down: true, right: true } },
];

const moving: readonly SkillDef[] = [...inputContent.skills.values()].filter((skill: SkillDef): boolean => heroMotion(skill) !== 'still');

function unit(way: Vec2): Vec2 {
  const length: number = Math.hypot(way.x, way.z);
  return { x: way.x / length, z: way.z / length };
}

function holding(skill: SkillDef, keys: boolean): Rig {
  const world: World = arena(STEER.seed);
  world.player.skills[STEER.slot] = skill;
  const setup: Rig = rig(world, (): boolean => false, undefined, undefined, SLOTS);
  if (keys) setup.settings.setMovement('keys');
  return setup;
}

function play(setup: Rig, seconds: number): void {
  for (let clock: number = 0; clock < seconds; clock += DT) {
    setup.world.player.mana = setup.world.player.stats.maxMana;
    stepWorld(setup.world, setup.input.collect(DT), DT);
  }
}

function travelled(skill: SkillDef, keys: boolean, way: Way): Vec2 {
  const setup: Rig = holding(skill, keys);
  const { world } = setup;
  const from: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  setup.fire('pointermove', at(screenOf(world, { x: from.x + STEER.cursor.x, z: from.z + STEER.cursor.z }), -1, 0));
  for (const code of way.codes) setup.fire('keydown', { code });
  setup.fire('keydown', { code: 'KeyQ' });
  let started: boolean = false;
  for (let clock: number = 0; clock < STEER.settle; clock += DT) {
    world.player.mana = world.player.stats.maxMana;
    stepWorld(world, setup.input.collect(DT), DT);
    if (world.player.action?.skill.id === skill.id) started = true;
    else if (started && heroMotion(skill) !== 'carried') break;
    if (heroMotion(skill) === 'carried' && clock >= STEER.carry) break;
  }
  assert.ok(started, `${skill.id} started`);
  const reached: Vec2 = { x: world.player.pos.x - from.x, z: world.player.pos.z - from.z };
  setup.fire('keyup', { code: 'KeyQ' });
  for (const code of way.codes) setup.fire('keyup', { code });
  play(setup, DT);
  return reached;
}

function along(moved: Vec2, way: Vec2): number {
  return moved.x * way.x + moved.z * way.z;
}

function across(moved: Vec2, way: Vec2): number {
  return Math.abs(moved.x * way.z - moved.z * way.x);
}

function expectedTravelDirection(motion: HeroMotion, keys: boolean, way: Way): Vec2 {
  const cursor: Vec2 = unit(STEER.cursor);
  const walk: Vec2 | null = keys ? keysDirection(way.keys, YAW) : null;
  if (motion === 'strafe' || (motion === 'carried' && keys)) return walk ?? { x: 0, z: 0 };
  if (motion === 'rolled') return walk ?? cursor;
  return cursor;
}

void test('the rule: a carried skill follows the active mode, a roll follows held keys else the cursor, and an aimed skill keeps the cursor', (): void => {
  const cursor: Vec2 = { x: 9, z: 3 };
  const from: Vec2 = { x: 1, z: 1 };
  const right: Vec2 = { x: 1, z: 0 };
  const reach: Vec2 = { x: 1 + SKILL_STEER.keyReach, z: 1 };
  assert.deepEqual(motionAim('carried', { movement: 'click', keys: right, cursor, from }), cursor);
  assert.deepEqual(motionAim('carried', { movement: 'keys', keys: right, cursor, from }), reach);
  assert.deepEqual(motionAim('carried', { movement: 'keys', keys: null, cursor, from }), from);
  assert.deepEqual(motionAim('rolled', { movement: 'keys', keys: right, cursor, from }), reach);
  assert.deepEqual(motionAim('rolled', { movement: 'keys', keys: null, cursor, from }), cursor);
  assert.deepEqual(motionAim('strafe', { movement: 'keys', keys: right, cursor, from }), cursor);
  assert.deepEqual(motionAim('strafe', { movement: 'keys', keys: null, cursor, from }), cursor);
  assert.deepEqual(motionAim('aimed', { movement: 'keys', keys: right, cursor, from }), cursor);
  assert.deepEqual(motionAim('still', { movement: 'keys', keys: right, cursor, from }), cursor);
});

void test('every shipped skill that moves the hero has a rule, and the Millwheel, the Dodge Roll and the steps are among them', (): void => {
  const motions: Map<string, HeroMotion> = new Map<string, HeroMotion>(moving.map((skill: SkillDef): [string, HeroMotion] => [skill.id, heroMotion(skill)]));
  assert.equal(motions.get('cleave_millwheel'), 'carried');
  assert.equal(motions.get('dodge_roll'), 'rolled');
  assert.equal(motions.get('mist_step'), 'aimed');
  for (const skill of inputContent.skills.values()) {
    const moves: boolean = skill.press?.type === 'travel' || (skill.press?.type === 'channel' && skill.press.move > 0) || skill.leap !== null || skill.delivery.type === 'dash' || skill.delivery.type === 'blink';
    assert.equal(heroMotion(skill) !== 'still', moves, skill.id);
  }
});

for (const skill of moving) {
  void test(`${skill.id} (${heroMotion(skill)}) carries the hero where the rule says, by click and by each of the eight keys and none`, (): void => {
    const motion: HeroMotion = heroMotion(skill);
    for (const keys of [false, true]) {
      for (const way of keys ? WAYS : WAYS.slice(0, 1)) {
        const moved: Vec2 = travelled(skill, keys, way);
        const label: string = `${skill.id} ${keys ? 'keys' : 'click'} ${way.name}: moved ${moved.x.toFixed(2)},${moved.z.toFixed(2)}`;
        const goal: Vec2 = expectedTravelDirection(motion, keys, way);
        if (Math.hypot(goal.x, goal.z) < 1e-6) {
          assert.ok(Math.hypot(moved.x, moved.z) < STEER.still, `${label}, expected to stay`);
          continue;
        }
        const toward: Vec2 = unit(goal);
        assert.ok(along(moved, toward) > STEER.along, `${label}, expected along ${toward.x.toFixed(2)},${toward.z.toFixed(2)}`);
        assert.ok(across(moved, toward) < Math.max(STEER.sideways, along(moved, toward) * STEER.sideways), `${label}, drifted sideways`);
      }
    }
  });
}

function skillOf(id: string): SkillDef {
  const skill: SkillDef | undefined = inputContent.skills.get(id);
  assert.ok(skill !== undefined, id);
  return skill;
}

function wayOf(name: string): Way {
  const way: Way | undefined = WAYS.find((entry: Way): boolean => entry.name === name);
  assert.ok(way !== undefined, name);
  return way;
}

function heldFor(setup: Rig, way: Way, seconds: number): Vec2 {
  const from: Vec2 = { x: setup.world.player.pos.x, z: setup.world.player.pos.z };
  for (const code of way.codes) setup.fire('keydown', { code });
  play(setup, seconds);
  for (const code of way.codes) setup.fire('keyup', { code });
  return { x: setup.world.player.pos.x - from.x, z: setup.world.player.pos.z - from.z };
}

void test('a Millwheel toggled on in key movement follows the keys, turns when they change, and stays put with none held', (): void => {
  const setup: Rig = holding(skillOf('cleave_millwheel'), true);
  setup.settings.setHeldSkills('toggle');
  const { world } = setup;
  setup.fire('pointermove', at(screenOf(world, { x: world.player.pos.x + STEER.cursor.x, z: world.player.pos.z + STEER.cursor.z }), -1, 0));
  setup.fire('keydown', { code: 'KeyQ' });
  play(setup, DT * 2);
  setup.fire('keyup', { code: 'KeyQ' });
  for (const name of ['right', 'up', 'down-left']) {
    const way: Vec2 = unit(must(keysDirection(wayOf(name).keys, YAW), name));
    const moved: Vec2 = heldFor(setup, wayOf(name), STEER.carry);
    assert.ok(along(moved, way) > STEER.along, `${name}: ${moved.x.toFixed(2)},${moved.z.toFixed(2)}`);
    assert.equal(world.player.action?.skill.id, 'cleave_millwheel', `${name}: still turning`);
  }
  play(setup, DT * 4);
  const rest: Vec2 = heldFor(setup, wayOf('none'), STEER.carry);
  assert.ok(Math.hypot(rest.x, rest.z) < STEER.still, `none: drifted ${rest.x.toFixed(2)},${rest.z.toFixed(2)}`);
  assert.equal(setup.input.reading.toggled, 'Millwheel');
});

void test('in key movement a swing faces the cursor while W walks, and a roll pressed during the swing goes the way the keys point once it ends', (): void => {
  const world: World = arena(STEER.seed);
  world.player.skills[0] = skillOf('cleave');
  world.player.skills[STEER.slot] = skillOf('dodge_roll');
  const setup: Rig = rig(world, (): boolean => false, undefined, undefined, SLOTS);
  setup.settings.setMovement('keys');
  const cursor: Vec2 = unit(STEER.cursor);
  const point: Vec2 = screenOf(world, { x: world.player.pos.x + STEER.cursor.x, z: world.player.pos.z + STEER.cursor.z });
  faceAt(world.player, { x: world.player.pos.x + STEER.cursor.x, z: world.player.pos.z + STEER.cursor.z });
  setup.fire('pointermove', at(point, -1, 0));
  setup.fire('keydown', { code: 'KeyW' });
  setup.fire('pointerdown', at(point, 0, 1));
  let swung: boolean = false;
  let rolled: Vec2 | null = null;
  let from: Vec2 = { x: 0, z: 0 };
  for (let clock: number = 0; clock < STEER.settle && rolled === null; clock += DT) {
    stepWorld(world, setup.input.collect(DT), DT);
    setup.fire('pointerup', at(point, 0, 0));
    const action = world.player.action;
    if (action?.skill.id === 'cleave') {
      if (!swung) setup.fire('keydown', { code: 'KeyQ' });
      swung = true;
      assert.ok(along(action.direction, cursor) > 0.9, `the swing turned off the cursor: ${action.direction.x.toFixed(2)},${action.direction.z.toFixed(2)}`);
    }
    if (action?.skill.id === 'dodge_roll' && from.x === 0) from = { x: world.player.pos.x, z: world.player.pos.z };
    if (from.x !== 0 && action?.skill.id !== 'dodge_roll') rolled = { x: world.player.pos.x - from.x, z: world.player.pos.z - from.z };
  }
  assert.ok(swung, 'the click swung');
  const up: Vec2 = unit(must(keysDirection(wayOf('up').keys, YAW), 'up'));
  assert.ok(rolled !== null && along(rolled, up) > STEER.along, `the roll went ${JSON.stringify(rolled)}`);
});

function must<T>(value: T | null | undefined, what: string): T {
  assert.ok(value !== null && value !== undefined, what);
  return value;
}
