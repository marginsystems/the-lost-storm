import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestScene } from '../../test/motion-support.ts';
import { MOTION_DT, placedProp, sceneZone } from '../../test/motion-support.ts';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, DashDelivery, SkillDef, ZoneDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { isWalkable, lineWalkable } from '../nav/grid.ts';
import { targetsOf } from './combat.ts';
import { DASH, dashAim, isDashing, isInvulnerable } from './dash.ts';
import { spawnPacks } from './monsters.ts';
import { stepWorld } from './step.ts';
import type { Command, MonsterState, World, WorldEvent } from './types.ts';
import { enterZone } from './zones.ts';
import { roadWorld, roadZone, SCENE_BASE } from '../../test/road-support.ts';

const content: Content = loadContent();
const base: ZoneDef = SCENE_BASE;
const roll: SkillDef = must(content.skills.get('dodge_roll'), 'dodge_roll');
const slot: number = content.player.skillBar.findIndex((entry): boolean => entry.skill === roll.id);
function dashOfRoll(): DashDelivery {
  if (roll.delivery.type !== 'dash') throw new Error('dodge_roll is not a dash');
  return roll.delivery;
}

const dash: DashDelivery = dashOfRoll();

const OPEN: readonly string[] = ['.......', '.......', '.......', '.......', '.......', '.......', '.......'];
const WALLED: readonly string[] = ['....   ', '....   ', '....   ', '....   ', '....   ', '....   ', '....   '];
const LIMITS = { tolerance: 0.05, settle: 3, shove: 0.2 } as const;

type Start = Extract<WorldEvent, { readonly type: 'skill_start' }>;

function scene(name: string, layout: TestScene): World {
  const world: World = worldIn(content, content.world.start, 5);
  enterZone(world, sceneZone(base, `test_${name}`, layout), { type: 'start' });
  world.events = [];
  world.monsters = [];
  return world;
}

function rollToward(aim: Vec2): Command {
  return { type: 'skill', slot, aim, targetId: null };
}

function started(events: readonly WorldEvent[], actorId: number): Start | null {
  return events.find((event: WorldEvent): event is Start => event.type === 'skill_start' && event.actorId === actorId && event.skill.id === roll.id) ?? null;
}

function finish(world: World): Vec2[] {
  const trace: Vec2[] = [{ ...world.player.pos }];
  for (let step: number = 0; step < LIMITS.settle / MOTION_DT && world.player.action !== null; step += 1) {
    stepWorld(world, [], MOTION_DT);
    trace.push({ ...world.player.pos });
  }
  return trace;
}

function spawnAt(world: World, kind: string, at: Vec2): MonsterState {
  world.zone = { ...world.zone, packs: [{ x: at.x, z: at.z, members: [{ monster: kind, count: 1, mods: [] }], when: [] }] };
  spawnPacks(world);
  const monster: MonsterState = must(world.monsters.at(-1), kind);
  monster.pos = { x: at.x, z: at.z };
  monster.spawnTime = 0;
  return monster;
}

void test('the roll is a dash skill bound to Space on the skill bar', (): void => {
  assert.ok(slot >= 0);
  assert.deepEqual(content.player.skillBar[slot]?.bindings, ['Space']);
  assert.ok(dash.distance > 0 && dash.invulnerable > 0 && dash.invulnerable < dash.duration && roll.cooldown > 0);
  assert.equal(roll.windup, dash.duration);
});

void test('a roll starts on the frame of the key press and covers its full distance on open ground', (): void => {
  const world: World = scene('open', { tiles: OPEN, props: [], start: { x: 14, z: 14 } });
  const from: Vec2 = { ...world.player.pos };
  const events: WorldEvent[] = stepWorld(world, [rollToward({ x: from.x + 10, z: from.z })], MOTION_DT);
  assert.notEqual(started(events, world.player.id), null);
  assert.ok(world.player.pos.x > from.x);
  finish(world);
  assert.ok(Math.abs(world.player.pos.x - from.x - dash.distance) < LIMITS.tolerance, `${world.player.pos.x - from.x}`);
  assert.ok(Math.abs(world.player.pos.z - from.z) < LIMITS.tolerance);
});

void test('a roll into a wall stops at the wall and never ends inside it', (): void => {
  const world: World = scene('wall', { tiles: WALLED, props: [], start: { x: 13, z: 14 } });
  const from: Vec2 = { ...world.player.pos };
  stepWorld(world, [rollToward({ x: from.x + 10, z: from.z })], MOTION_DT);
  const trace: Vec2[] = finish(world);
  assert.ok(world.player.pos.x - from.x < dash.distance - 1);
  assert.ok(world.player.pos.x < 16);
  for (const pos of trace) assert.ok(isWalkable(world.grid, pos.x, pos.z));
});

void test('a roll at a prop slides along it without passing through or stopping inside', (): void => {
  const world: World = scene('prop', { tiles: OPEN, props: [placedProp('mossy_pillar', 14, 14)], start: { x: 10, z: 13.6 } });
  const from: Vec2 = { ...world.player.pos };
  stepWorld(world, [rollToward({ x: from.x + 10, z: from.z })], MOTION_DT);
  const trace: Vec2[] = finish(world);
  for (let index: number = 1; index < trace.length; index += 1) {
    const before: Vec2 = must(trace[index - 1], 'before');
    const after: Vec2 = must(trace[index], 'after');
    assert.ok(isWalkable(world.grid, after.x, after.z));
    assert.ok(lineWalkable(world.grid, before, after));
  }
});

void test('the hero cannot be targeted during the invulnerable start of the roll, and can be after it', (): void => {
  const world: World = scene('frames', { tiles: OPEN, props: [], start: { x: 8, z: 14 } });
  stepWorld(world, [rollToward({ x: 20, z: 14 })], MOTION_DT);
  let elapsed: number = MOTION_DT;
  while (elapsed + MOTION_DT < dash.invulnerable) {
    assert.ok(isInvulnerable(world.player));
    assert.deepEqual(targetsOf(world, { sourceId: 0, faction: 'unfinished' }), []);
    stepWorld(world, [], MOTION_DT);
    elapsed += MOTION_DT;
  }
  while (elapsed <= dash.invulnerable + MOTION_DT) {
    stepWorld(world, [], MOTION_DT);
    elapsed += MOTION_DT;
  }
  assert.equal(isInvulnerable(world.player), false);
  assert.deepEqual(targetsOf(world, { sourceId: 0, faction: 'unfinished' }), [world.player]);
});

void test('a second roll waits for the cooldown', (): void => {
  const world: World = scene('cooldown', { tiles: OPEN, props: [], start: { x: 6, z: 14 } });
  stepWorld(world, [rollToward({ x: 20, z: 14 })], MOTION_DT);
  finish(world);
  const early: WorldEvent[] = stepWorld(world, [rollToward({ x: 6, z: 14 })], MOTION_DT);
  assert.equal(started(early, world.player.id), null);
  assert.ok(early.some((event: WorldEvent): boolean => event.type === 'notice' && event.reason === 'on_cooldown'));
  for (let step: number = 0; step < roll.cooldown / MOTION_DT; step += 1) stepWorld(world, [], MOTION_DT);
  assert.notEqual(started(stepWorld(world, [rollToward({ x: 6, z: 14 })], MOTION_DT), world.player.id), null);
});

void test('the hero cannot roll while dead or stunned', (): void => {
  const dead: World = scene('dead', { tiles: OPEN, props: [], start: { x: 14, z: 14 } });
  dead.player.alive = false;
  assert.equal(started(stepWorld(dead, [rollToward({ x: 20, z: 14 })], MOTION_DT), dead.player.id), null);
  const stunned: World = scene('stunned', { tiles: OPEN, props: [], start: { x: 14, z: 14 } });
  stunned.player.stagger = 1;
  const from: Vec2 = { ...stunned.player.pos };
  assert.equal(started(stepWorld(stunned, [rollToward({ x: 20, z: 14 })], MOTION_DT), stunned.player.id), null);
  assert.deepEqual(stunned.player.pos, from);
});

void test('a roll cuts the recovery of an attack but waits out its wind-up', (): void => {
  const world: World = scene('cancel', { tiles: OPEN, props: [], start: { x: 8, z: 14 } });
  stepWorld(world, [{ type: 'skill', slot: 0, aim: { x: 4, z: 14 }, targetId: null }], MOTION_DT);
  assert.equal(world.player.action?.phase, 'windup');
  const pressed: WorldEvent[] = stepWorld(world, [rollToward({ x: 20, z: 14 })], MOTION_DT);
  assert.equal(started(pressed, world.player.id), null);
  let rolledAt: string | null = null;
  for (let step: number = 0; step < 60 && rolledAt === null; step += 1) {
    const events: WorldEvent[] = stepWorld(world, [], MOTION_DT);
    if (started(events, world.player.id) !== null) rolledAt = events.some((event: WorldEvent): boolean => event.type === 'skill_impact') ? 'impact' : 'later';
  }
  assert.equal(rolledAt, 'impact');

  const again: World = scene('cancel_recovery', { tiles: OPEN, props: [], start: { x: 8, z: 14 } });
  stepWorld(again, [{ type: 'skill', slot: 0, aim: { x: 4, z: 14 }, targetId: null }], MOTION_DT);
  while (again.player.action?.phase === 'windup') stepWorld(again, [], MOTION_DT);
  assert.equal(again.player.action?.phase, 'recovery');
  assert.notEqual(started(stepWorld(again, [rollToward({ x: 20, z: 14 })], MOTION_DT), again.player.id), null);
  assert.equal(again.player.action.skill.id, roll.id);
});

void test('a roll passes through a monster standing in its way', (): void => {
  const world: World = scene('through', { tiles: OPEN, props: [], start: { x: 10, z: 14 } });
  const monster: MonsterState = spawnAt(world, 'mended', { x: 12.5, z: 14 });
  const from: Vec2 = { ...world.player.pos };
  const stood: Vec2 = { ...monster.pos };
  stepWorld(world, [rollToward({ x: 20, z: 14 })], MOTION_DT);
  while (isDashing(world.player)) stepWorld(world, [], MOTION_DT);
  assert.ok(Math.hypot(monster.pos.x - stood.x, monster.pos.z - stood.z) < LIMITS.shove, `monster shoved to ${monster.pos.x}, ${monster.pos.z}`);
  finish(world);
  assert.ok(world.player.pos.x > monster.pos.x, `${world.player.pos.x} vs ${monster.pos.x}`);
  assert.ok(Math.abs(world.player.pos.x - from.x - dash.distance) < LIMITS.tolerance);
});

void test('with the cursor on the hero, the roll follows the path the hero is walking', (): void => {
  const world: World = scene('aim', { tiles: OPEN, props: [], start: { x: 14, z: 14 } });
  const ahead: Vec2 = { x: 14, z: 20 };
  assert.deepEqual(dashAim(world.player, { x: world.player.pos.x + DASH.aimDeadZone / 2, z: world.player.pos.z }, [ahead]), ahead);
  stepWorld(world, [{ type: 'move', held: false, dest: { x: 14, z: 24 } }], MOTION_DT);
  const from: Vec2 = { ...world.player.pos };
  stepWorld(world, [rollToward({ ...world.player.pos })], MOTION_DT);
  finish(world);
  assert.ok(world.player.pos.z - from.z > dash.distance - 1);
});

void test('a monster whose skill is a dash rolls with the same code', (): void => {
  const world: World = scene('monster', { tiles: OPEN, props: [], start: { x: 6, z: 14 } });
  const monster: MonsterState = spawnAt(world, 'mended', { x: 10, z: 14 });
  world.monsters = [{ ...monster, def: { ...monster.def, skill: roll.id }, aggro: true }];
  const roller: MonsterState = must(world.monsters[0], 'roller');
  let from: Vec2 | null = null;
  for (let step: number = 0; step < 240 && from === null; step += 1) {
    const before: Vec2 = { ...roller.pos };
    if (started(stepWorld(world, [], MOTION_DT), roller.id) !== null) from = before;
  }
  const origin: Vec2 = must(from, 'the monster rolled');
  assert.ok(isDashing(roller));
  for (let step: number = 0; step < 60 && isDashing(roller); step += 1) stepWorld(world, [], MOTION_DT);
  assert.ok(Math.hypot(roller.pos.x - origin.x, roller.pos.z - origin.z) > dash.distance - 1);
});

void test('a roll through deep water covers only the water\'s share of its distance', (): void => {
  const world: World = roadWorld(roadZone({ tiles: ['ssssssss', 'ssssssss', 'ssssssss', 'ssssssss'], playerStart: { x: 4, z: 8 } }));
  const from: Vec2 = { ...world.player.pos };
  stepWorld(world, [rollToward({ x: from.x + 10, z: from.z })], MOTION_DT);
  finish(world);
  assert.ok(Math.abs(world.player.pos.x - from.x - dash.distance * 0.5) < LIMITS.tolerance, `${world.player.pos.x - from.x}`);
});
