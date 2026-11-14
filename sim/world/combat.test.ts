import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, ARENA_CONTENT, arena, place } from '../../test/arena-support.ts';
import { cast, damageTo, dummy, offset, run, shapeArena } from '../../test/shape-support.ts';
import { must } from '../../test/support.ts';
import type { SkillCommit } from '../content/combat-types.ts';
import type { SkillDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { applyHit, guardOutcome, offenceOf } from './combat.ts';
import { startSkill } from './skills.ts';
import { stepWorld } from './step.ts';
import type { ActionState, Command, MonsterState, World, WorldEvent } from './types.ts';

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
  target.action = { skill: must(ARENA_CONTENT.skills.get('test_slam'), 'slam'), phase: 'recovery', timeLeft: 0.5, windup: 1, recovery: 1, direction: front, target: null, travelSpeed: 0, travelLeft: 0, slot: null, elapsed: 0 };
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

void test('a second grab right after the first cannot root the hero again until the grace runs out, so grabs never chain', (): void => {
  const world: World = arena(4);
  const shambler: MonsterState = place(world, 'test_shambler', { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z + 1.4 });
  shambler.alive = false;
  applyHit(world, offenceOf(shambler), world.player, grab, { x: 0, z: -1 });
  for (let step: number = 0; step < Math.round(grab.root / DT) + 1; step += 1) stepWorld(world, [], DT);
  assert.equal(world.player.root, 0);
  applyHit(world, offenceOf(shambler), world.player, grab, { x: 0, z: -1 });
  assert.equal(world.player.root, 0);
  for (let step: number = 0; step < Math.round(ARENA_CONTENT.player.rootGrace / DT) + 1; step += 1) stepWorld(world, [], DT);
  applyHit(world, offenceOf(shambler), world.player, grab, { x: 0, z: -1 });
  assert.equal(world.player.root, grab.root);
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

void test('a branding hit marks the enemy, and the next hit from another skill bursts the brand on everything near it', (): void => {
  const world: World = shapeArena(['test_brander', 'test_fork']);
  const branded: MonsterState = dummy(world, offset(2, 0));
  const neighbour: MonsterState = dummy(world, offset(4, 1));
  const first: WorldEvent[] = [...cast(world, 0, offset(2, 0)), ...run(world, 0.3)];
  assert.equal(branded.brand?.source, 'test_brander');
  assert.ok(first.some((event: WorldEvent): boolean => event.type === 'brand' && !event.burst));
  const second: WorldEvent[] = [...cast(world, 1, branded.pos), ...run(world, 0.3)];
  assert.equal(branded.brand, null);
  assert.ok(second.some((event: WorldEvent): boolean => event.type === 'brand' && event.burst));
  assert.ok(damageTo(second, neighbour.id).includes(50));
  assert.ok(damageTo(second, branded.id).includes(50));
});

void test('hitting a brand again with the skill that set it refreshes it instead of bursting it', (): void => {
  const world: World = shapeArena(['test_brander']);
  const branded: MonsterState = dummy(world, offset(2, 0));
  cast(world, 0, offset(2, 0));
  run(world, 1);
  const before: number = branded.brand?.timeLeft ?? 0;
  const again: WorldEvent[] = [...cast(world, 0, offset(2, 0)), ...run(world, 0.3)];
  assert.ok((branded.brand?.timeLeft ?? 0) > before);
  assert.ok(!again.some((event: WorldEvent): boolean => event.type === 'brand' && event.burst));
});

void test('a brand fades when its time runs out', (): void => {
  const world: World = shapeArena(['test_brander']);
  const branded: MonsterState = dummy(world, offset(2, 0));
  cast(world, 0, offset(2, 0));
  run(world, 5.5);
  assert.equal(branded.brand, null);
});

function stormHitTaken(stormResist: number, stormTier: number): number {
  const world: World = arena(3);
  const attacker: MonsterState = brute(world);
  world.zone = { ...world.zone, stormTier };
  world.player.stats = { ...world.player.stats, armour: 0, stormResist };
  world.player.life = world.player.maxLife;
  const storm: SkillDef = { ...light, damage: { ...light.damage, type: 'storm', weaponPercent: 0, flatMin: 40, flatMax: 40 } };
  applyHit(world, { ...offenceOf(attacker), critChance: 0 }, world.player, storm, toward(attacker.pos, world.player.pos));
  return world.player.maxLife - world.player.life;
}

void test('a storm hit on the hero is cut by storm resistance, and a deeper storm tier takes resistance away', (): void => {
  assert.equal(stormHitTaken(0, 0), 40);
  assert.equal(stormHitTaken(0.5, 0), 20);
  assert.equal(stormHitTaken(0.5, 1), 28);
  assert.equal(stormHitTaken(0.9, 0), 10);
});

void test('a hit with negative knockback pulls the target toward the striker', (): void => {
  const world: World = arena(1);
  const target: MonsterState = place(world, 'test_shambler', { x: ARENA_CENTRE.x + 2.5, z: ARENA_CENTRE.z });
  const pull: SkillDef = { ...light, knockback: -8 };
  const away: Vec2 = toward(world.player.pos, target.pos);
  applyHit(world, { ...offenceOf(world.player), damageMin: 1, damageMax: 1, critChance: 0 }, target, pull, away);
  assert.ok(target.knock.x * away.x + target.knock.z * away.z < 0);
});

const haymaker: SkillDef = must(ARENA_CONTENT.skills.get('brute_haymaker'), 'brute_haymaker');

function hammerer(world: World): MonsterState {
  const monster: MonsterState = place(world, 'unfinished_brute', { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z + 2.2 });
  monster.facing = Math.atan2(world.player.pos.x - monster.pos.x, world.player.pos.z - monster.pos.z);
  return monster;
}

function windUp(world: World, monster: MonsterState, seconds: number): void {
  startSkill(world, monster, haymaker, toward(monster.pos, world.player.pos));
  const action: ActionState = must(monster.action, 'haymaker windup');
  action.elapsed = seconds;
  action.timeLeft = action.windup - seconds;
}

function hit(world: World, monster: MonsterState, skill: SkillDef): void {
  applyHit(world, { ...offenceOf(world.player), critChance: 0 }, monster, skill, toward(world.player.pos, monster.pos));
}

void test('a light hit early in a Haymaker interrupts it, but past its commit point only a heavy hit breaks it', (): void => {
  const commit: SkillCommit = must(haymaker.commit, 'haymaker commit');
  assert.ok(light.stagger < commit.breakStagger && heavy.stagger >= commit.breakStagger);
  const early: World = arena(1);
  const opened: MonsterState = hammerer(early);
  windUp(early, opened, 0);
  hit(early, opened, light);
  assert.equal(opened.action, null);
  assert.ok(early.events.some((event: WorldEvent): boolean => event.type === 'skill_interrupt' && event.actorId === opened.id));
  const late: World = arena(1);
  const committed: MonsterState = hammerer(late);
  windUp(late, committed, haymaker.windup * commit.at + 0.05);
  const life: number = committed.life;
  hit(late, committed, light);
  assert.equal(committed.action?.phase, 'windup');
  assert.equal(committed.stagger, 0);
  assert.ok(committed.life < life);
  hit(late, committed, heavy);
  assert.equal(committed.action, null);
  assert.notEqual(committed.stagger, 0);
});

void test('a brute interrupted as often in a row as its resolve holds its next Haymaker against light hits, and a finished swing starts the count again', (): void => {
  const world: World = arena(1);
  const monster: MonsterState = hammerer(world);
  const resolve: number = monster.def.poise.resolve;
  assert.ok(resolve > 0);
  for (let count: number = 1; count <= resolve; count += 1) {
    windUp(world, monster, 0);
    hit(world, monster, light);
    assert.equal(monster.action, null);
    assert.equal(monster.interrupts, count);
  }
  monster.stagger = 0;
  windUp(world, monster, 0);
  hit(world, monster, light);
  assert.equal(monster.action?.phase, 'windup');
  assert.equal(monster.stagger, 0);
  hit(world, monster, heavy);
  assert.equal(monster.action, null);
  monster.interrupts = resolve;
  monster.stagger = 0;
  windUp(world, monster, haymaker.windup - DT / 2);
  stepWorld(world, [], DT);
  assert.equal(monster.interrupts, 0);
  monster.action = null;
  windUp(world, monster, 0);
  hit(world, monster, light);
  assert.equal(monster.action, null);
});

void test('a hero who stands and spams Cleave at a brute is answered with a Haymaker', (): void => {
  const world: World = arena(3);
  const monster: MonsterState = hammerer(world);
  monster.life = 100000;
  monster.maxLife = 100000;
  world.player.life = 100000;
  world.player.maxLife = 100000;
  const events: WorldEvent[] = [];
  for (let step: number = 0; step < 15 / DT; step += 1) {
    const swing: readonly Command[] = world.player.action === null ? [{ type: 'skill', slot: 0, aim: { x: monster.pos.x, z: monster.pos.z }, targetId: monster.id }] : [];
    events.push(...stepWorld(world, swing, DT));
  }
  const starts: number = events.filter((event: WorldEvent): boolean => event.type === 'skill_start' && event.actorId === monster.id).length;
  const interrupts: number = events.filter((event: WorldEvent): boolean => event.type === 'skill_interrupt' && event.actorId === monster.id).length;
  const landed: number = events.filter((event: WorldEvent): boolean => event.type === 'damage' && event.sourceId === monster.id && event.targetId === world.player.id).length;
  assert.ok(interrupts > 0, 'spam still interrupts some swings');
  assert.ok(interrupts < starts, 'not every swing is interrupted');
  assert.ok(landed > 0, 'the brute lands a Haymaker');
});
