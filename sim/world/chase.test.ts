import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sceneZone } from '../../test/motion-support.ts';
import { standAt } from '../../test/moment-support.ts';
import { SCENE_BASE } from '../../test/road-support.ts';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, SkillDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { liftStamp } from '../nav/grid.ts';
import { findPath } from '../nav/path.ts';
import { blockerInReach, CHASE, chasePath } from './chase.ts';
import { createWorld } from './create.ts';
import { echoMonsters, forceStrike } from './moments.ts';
import { spawnPacks } from './monsters.ts';
import { handleCommand } from './player.ts';
import { stepWorld } from './step.ts';
import type { Command, MomentState, MonsterState, World } from './types.ts';
import { enterZone } from './zones.ts';

const PROBE = { dt: 1 / 30, east: 30, clearBy: 45, clickEvery: 8, bearings: 8, idleLimit: 0.5, seeds: [1, 2, 3, 4, 5, 6, 7, 8], cellSlack: 0.3, turnSlack: 1e-6, chaseTicks: 30, closeIn: 2, frameSteps: [1 / 20, 1 / 60], walkBy: 4, reclick: 5, longCooldown: 3, clickedShare: 0.5 } as const;
const SCENE = { tiles: Array.from({ length: 7 }, (): string => '.......'), hero: { x: 6, z: 14 }, body: { x: 9, z: 14 }, target: { x: 13, z: 14 }, behind: { x: 4.6, z: 14 }, touching: { x: 7.1, z: 14 } } as const;
const HALL = { hero: { x: 62, z: 30 }, body: { x: 64.4, z: 30 }, target: { x: 69, z: 30 } } as const;

const content: Content = loadContent();

function spawnAt(world: World, kind: string, at: Vec2): MonsterState {
  world.zone = { ...world.zone, packs: [{ x: at.x, z: at.z, members: [{ monster: kind, count: 1, mods: [] }], when: [] }] };
  spawnPacks(world);
  const monster: MonsterState = must(world.monsters.at(-1), `${kind} spawned`);
  monster.pos = { x: at.x, z: at.z };
  monster.lastPos = { x: at.x, z: at.z };
  monster.spawnTime = 0;
  return monster;
}

function openScene(): World {
  const world: World = worldIn(content, content.world.start, 3);
  enterZone(world, { ...sceneZone(SCENE_BASE, 'test_chase', { tiles: SCENE.tiles, props: [], start: SCENE.hero }), moments: null }, { type: 'start' });
  world.monsters = [];
  world.moments = [];
  world.player.pos = { x: SCENE.hero.x, z: SCENE.hero.z };
  return world;
}

function hallScene(): World {
  const world: World = createWorld(content, { seed: 7, save: null });
  enterZone(world, must(content.zones.get('hall_of_time'), 'hall'), { type: 'start' });
  for (const moment of world.moments) if (moment.blocks !== null) liftStamp(world.grid, moment.blocks);
  world.moments = [];
  world.monsters = [];
  world.player.pos = { x: HALL.hero.x, z: HALL.hero.z };
  world.player.invulnerable = Infinity;
  return world;
}

function hold(monsters: readonly MonsterState[]): void {
  for (const monster of monsters) {
    monster.aggro = false;
    monster.root = PROBE.walkBy;
    monster.life = monster.maxLife;
  }
}

function gapToSegment(point: Vec2, from: Vec2, to: Vec2): number {
  const dx: number = to.x - from.x;
  const dz: number = to.z - from.z;
  const length: number = dx * dx + dz * dz;
  const along: number = length === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.z - from.z) * dz) / length));
  return distance(point, { x: from.x + dx * along, z: from.z + dz * along });
}

function closestPass(path: readonly Vec2[], start: Vec2, point: Vec2): number {
  let closest: number = Infinity;
  let from: Vec2 = start;
  for (const to of path) {
    closest = Math.min(closest, gapToSegment(point, from, to));
    from = to;
  }
  return closest;
}

void test('the chase path steps round a body standing between the hero and his target', (): void => {
  const world: World = openScene();
  const body: MonsterState = spawnAt(world, 'unfinished_brute', SCENE.body);
  const target: MonsterState = spawnAt(world, 'unfinished_thrower', SCENE.target);
  const clearance: number = body.radius + world.content.player.radius - PROBE.cellSlack;
  assert.ok(closestPass(findPath(world.grid, world.player.pos, target.pos), world.player.pos, body.pos) < clearance, 'the plain path runs through the body');
  const around: Vec2[] = chasePath(world, target);
  assert.ok(around.length > 0);
  assert.ok(closestPass(around, world.player.pos, body.pos) >= clearance, `passes ${closestPass(around, world.player.pos, body.pos).toFixed(2)} from the body`);
  assert.ok(distance(must(around.at(-1), 'goal'), target.pos) < PROBE.cellSlack);
});

void test('the blocker he swings at is a hostile body in reach on his way, never the target and never one behind him', (): void => {
  const world: World = openScene();
  const skill: SkillDef = must(world.player.skills[0], 'first skill');
  const target: MonsterState = spawnAt(world, 'unfinished_thrower', SCENE.target);
  const behind: MonsterState = spawnAt(world, 'unfinished_brute', SCENE.behind);
  world.player.path = [{ x: SCENE.target.x, z: SCENE.target.z }];
  assert.equal(blockerInReach(world, target, skill), null);
  const ahead: MonsterState = spawnAt(world, 'unfinished_brute', { x: SCENE.hero.x + skill.engageRange, z: SCENE.hero.z });
  assert.equal(blockerInReach(world, target, skill)?.id, ahead.id);
  assert.notEqual(blockerInReach(world, target, skill)?.id, behind.id);
});

function awakeFirstFire(seed: number, from: Vec2): { world: World; moment: MomentState } {
  const world: World = createWorld(content, { seed, save: null });
  enterZone(world, must(content.zones.get('hall_of_time'), 'hall'), { type: 'start' });
  world.monsters = [];
  world.player.invulnerable = Infinity;
  const moment: MomentState = must(forceStrike(world, { x: world.player.pos.x + PROBE.east, z: world.player.pos.z }, 'first_fire'), 'first fire');
  for (let elapsed: number = 0; elapsed < content.moments.telegraph + PROBE.dt * 2; elapsed += PROBE.dt) stepWorld(world, [], PROBE.dt);
  standAt(world, { x: moment.pos.x + from.x, z: moment.pos.z + from.z });
  stepWorld(world, [], PROBE.dt);
  assert.equal(moment.phase, 'awake');
  return { world, moment };
}

void test('clicking only on the first fire\'s thrower clears it from every bearing, and the hero never stands idle with a live target', (): void => {
  for (const seed of PROBE.seeds) {
    for (let bearing: number = 0; bearing < PROBE.bearings; bearing += 1) {
      const angle: number = (bearing / PROBE.bearings) * Math.PI * 2;
      const { world, moment } = awakeFirstFire(seed, { x: Math.cos(angle), z: Math.sin(angle) });
      let idle: number = 0;
      for (let tick: number = 0; tick * PROBE.dt < PROBE.clearBy && moment.outcome === null; tick += 1) {
        const living: MonsterState[] = echoMonsters(world, moment).filter((echo: MonsterState): boolean => echo.alive);
        const target: MonsterState | undefined = living.find((echo: MonsterState): boolean => echo.def.id === 'first_thrower') ?? living[0];
        const commands: Command[] = target !== undefined && tick % PROBE.clickEvery === 0 ? [{ type: 'skill', slot: 0, aim: { x: target.pos.x, z: target.pos.z }, targetId: target.id }] : [];
        stepWorld(world, commands, PROBE.dt);
        const standing: boolean = target !== undefined && target.alive && world.player.action === null && world.player.motion === 'still';
        idle = standing ? idle + PROBE.dt : 0;
        assert.ok(idle <= PROBE.idleLimit, `seed ${String(seed)} bearing ${String(bearing)}: stood ${idle.toFixed(2)} s at ${(tick * PROBE.dt).toFixed(1)} s`);
      }
      assert.equal(moment.outcome, 'resolved', `seed ${String(seed)} bearing ${String(bearing)}`);
    }
  }
});

void test('a click on a far target turns the hero toward it on the same frame', (): void => {
  const world: World = openScene();
  const target: MonsterState = spawnAt(world, 'unfinished_thrower', SCENE.target);
  world.player.facing = Math.atan2(-1, 0);
  handleCommand(world, { type: 'skill', slot: 0, aim: { x: target.pos.x, z: target.pos.z }, targetId: target.id });
  assert.equal(world.player.intent.type, 'attack');
  assert.ok(Math.abs(world.player.facing - Math.atan2(target.pos.x - world.player.pos.x, target.pos.z - world.player.pos.z)) < PROBE.turnSlack, `facing ${world.player.facing.toFixed(3)}`);
});

void test('clicking the same target again while he chases it leaves his turn to the steering, so he keeps walking round what is in the way', (): void => {
  const world: World = openScene();
  const target: MonsterState = spawnAt(world, 'unfinished_thrower', SCENE.target);
  const body: MonsterState = spawnAt(world, 'unfinished_brute', SCENE.touching);
  const start: number = distance(world.player.pos, target.pos);
  for (let tick: number = 0; tick < PROBE.chaseTicks; tick += 1) {
    hold([body, target]);
    stepWorld(world, [{ type: 'skill', slot: 0, aim: { x: target.pos.x, z: target.pos.z }, targetId: target.id }], PROBE.dt);
    target.pos = { x: SCENE.target.x, z: SCENE.target.z };
  }
  assert.ok(distance(world.player.pos, target.pos) < start - PROBE.closeIn, `only closed to ${distance(world.player.pos, target.pos).toFixed(2)} from ${start.toFixed(2)}`);
});

for (const dt of PROBE.frameSteps) {
  void test(`at a ${String(Math.round(dt * 1000))} ms step the hero walks round a body in his way without stopping until his swing`, (): void => {
    const world: World = hallScene();
    const body: MonsterState = spawnAt(world, 'unfinished_brute', HALL.body);
    const target: MonsterState = spawnAt(world, 'unfinished_thrower', HALL.target);
    world.player.facing = Math.PI / 2;
    let swung: boolean = false;
    for (let tick: number = 0; tick * dt < PROBE.walkBy && !swung; tick += 1) {
      hold([body, target]);
      stepWorld(world, tick % PROBE.reclick === 0 ? [{ type: 'skill', slot: 0, aim: { x: target.pos.x, z: target.pos.z }, targetId: target.id }] : [], dt);
      swung = world.player.action !== null;
      if (!swung) assert.equal(world.player.motion, 'stride', `stood at ${(tick * dt).toFixed(2)} s`);
    }
    assert.ok(swung, 'never reached his target');
    assert.ok(distance(world.player.pos, body.pos) > body.radius + world.content.player.radius);
  });
}

void test('one click on the first fire\'s thrower out of reach brings the hero to it and into a swing without standing idle, from every bearing', (): void => {
  let reached: number = 0;
  for (const seed of PROBE.seeds) {
    for (let bearing: number = 0; bearing < PROBE.bearings; bearing += 1) {
      const angle: number = (bearing / PROBE.bearings) * Math.PI * 2;
      const { world, moment } = awakeFirstFire(seed, { x: Math.cos(angle), z: Math.sin(angle) });
      const skill: SkillDef = must(world.player.skills[0], 'first skill');
      const thrower: MonsterState = must(echoMonsters(world, moment).find((echo: MonsterState): boolean => echo.def.id === 'first_thrower'), 'thrower');
      const outOfReach = (): boolean => distance(world.player.pos, thrower.pos) - thrower.radius > skill.engageRange;
      let clicked: boolean = false;
      let swung: boolean = false;
      let idle: number = 0;
      for (let tick: number = 0; tick * PROBE.dt < PROBE.clearBy && thrower.alive && !swung; tick += 1) {
        const click: boolean = !clicked && world.player.action === null && outOfReach();
        if (click) clicked = true;
        stepWorld(world, click ? [{ type: 'skill', slot: 0, aim: { x: thrower.pos.x, z: thrower.pos.z }, targetId: thrower.id }] : [], PROBE.dt);
        if (!clicked) continue;
        swung = world.player.action !== null && world.player.intent.type !== 'attack';
        idle = world.player.action === null && world.player.motion === 'still' ? idle + PROBE.dt : 0;
        assert.ok(idle <= PROBE.idleLimit, `seed ${String(seed)} bearing ${String(bearing)}: stood ${idle.toFixed(2)} s at ${(tick * PROBE.dt).toFixed(1)} s`);
      }
      if (!clicked) continue;
      assert.ok(swung || !thrower.alive, `seed ${String(seed)} bearing ${String(bearing)}: never reached the thrower`);
      reached += 1;
    }
  }
  assert.ok(reached >= PROBE.seeds.length * PROBE.bearings * PROBE.clickedShare, `only ${String(reached)} runs had the thrower out of reach`);
});

void test('after a swing at a blocker he goes back to his target even when the skill is still cooling down', (): void => {
  const world: World = openScene();
  const skill: SkillDef = must(world.player.skills[0], 'first skill');
  world.player.skills[0] = { ...skill, cooldown: PROBE.longCooldown };
  const target: MonsterState = spawnAt(world, 'unfinished_thrower', SCENE.target);
  const body: MonsterState = spawnAt(world, 'unfinished_brute', SCENE.touching);
  handleCommand(world, { type: 'skill', slot: 0, aim: { x: target.pos.x, z: target.pos.z }, targetId: target.id });
  world.player.chase = { mark: { x: world.player.pos.x, z: world.player.pos.z }, still: CHASE.patience };
  hold([body, target]);
  stepWorld(world, [], PROBE.dt);
  assert.notEqual(world.player.action, null, 'he swung at the blocker');
  for (let tick: number = 0; tick * PROBE.dt < PROBE.longCooldown && world.player.action !== null; tick += 1) {
    hold([body, target]);
    stepWorld(world, [], PROBE.dt);
  }
  assert.equal(world.player.action, null);
  assert.ok((world.player.cooldowns[skill.id] ?? 0) > 0, 'the skill is still cooling down');
  assert.deepEqual(world.player.intent, { type: 'attack', slot: 0, targetId: target.id });
  const before: number = distance(world.player.pos, target.pos);
  for (let tick: number = 0; tick < PROBE.chaseTicks; tick += 1) {
    hold([body, target]);
    stepWorld(world, [], PROBE.dt);
  }
  assert.ok(distance(world.player.pos, target.pos) < before - PROBE.closeIn, `only closed to ${distance(world.player.pos, target.pos).toFixed(2)} from ${before.toFixed(2)}`);
});
