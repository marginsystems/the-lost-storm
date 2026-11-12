import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, arena, place } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { ComboStep, Content, SkillDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { cellIndex } from '../nav/grid.ts';
import { chainedSkill, chargedSkill, comboHits, startSkill } from './skills.ts';
import { damageTo, dummy, offset, run, SHAPE_CONTENT, shapeArena, shapeSkill } from '../../test/shape-support.ts';
import { resolveSkill } from '../stats.ts';
import { stepWorld } from './step.ts';
import type { AreaState, Command, MonsterState, World, WorldEvent } from './types.ts';

const content: Content = loadContent();
const DT: number = 1 / 60;
const cleave: SkillDef = must(content.skills.get('cleave'), 'cleave');
const steps: readonly ComboStep[] = must(cleave.combo, 'cleave combo').steps;
const swing: Command = { type: 'skill', slot: 0, aim: { x: 28, z: 30 }, targetId: null };

type Start = Extract<WorldEvent, { readonly type: 'skill_start' }>;

function fresh(): World {
  return arena(3);
}

function swingOnce(world: World): Start {
  const events: WorldEvent[] = stepWorld(world, [swing], DT);
  const started: Start | undefined = events.find((event: WorldEvent): event is Start => event.type === 'skill_start');
  for (let step: number = 0; step < 600 && world.player.action !== null; step += 1) stepWorld(world, [], DT);
  return must(started, 'skill_start');
}

function wait(world: World, seconds: number): void {
  for (let step: number = 0; step < Math.round(seconds / DT); step += 1) stepWorld(world, [], DT);
}

void test('the basic attack is a chain: three swings in a row play three different clips and the third hits hardest', (): void => {
  const world: World = fresh();
  const first: Start = swingOnce(world);
  const second: Start = swingOnce(world);
  const third: Start = swingOnce(world);
  assert.equal(steps.length, 2);
  assert.deepEqual([first.skill.animation, second.skill.animation, third.skill.animation], [cleave.animation, steps[0]?.animation, steps[1]?.animation]);
  assert.equal(new Set<string>([first.skill.animation, second.skill.animation, third.skill.animation]).size, 3);
  assert.deepEqual([first.skill.id, second.skill.id, third.skill.id], ['cleave', 'cleave', 'cleave']);
  assert.ok(third.skill.damage.weaponPercent > second.skill.damage.weaponPercent && second.skill.damage.weaponPercent >= first.skill.damage.weaponPercent);
  assert.ok(third.skill.knockback > first.skill.knockback);
  assert.ok(third.skill.hitStop > first.skill.hitStop && third.skill.shake > first.skill.shake);
});

void test('after the last step the chain starts again from the opening swing', (): void => {
  const world: World = fresh();
  swingOnce(world);
  swingOnce(world);
  swingOnce(world);
  assert.equal(swingOnce(world).skill.animation, cleave.animation);
  assert.equal(swingOnce(world).skill.animation, steps[0]?.animation);
});

void test('a pause longer than the combo window drops the chain, and a shorter one keeps it', (): void => {
  const world: World = fresh();
  const window: number = must(cleave.combo, 'combo').window;
  swingOnce(world);
  wait(world, window * 0.5);
  assert.equal(swingOnce(world).skill.animation, steps[0]?.animation);
  wait(world, window + 0.1);
  assert.equal(world.player.combo, null);
  assert.equal(swingOnce(world).skill.animation, cleave.animation);
});

void test('another skill between swings breaks the chain', (): void => {
  const world: World = fresh();
  swingOnce(world);
  stepWorld(world, [{ type: 'skill', slot: 2, aim: { x: 28, z: 30 }, targetId: null }], DT);
  assert.equal(world.player.combo, null);
  wait(world, 1);
  assert.equal(swingOnce(world).skill.animation, cleave.animation);
});

void test('a combo step scales the skill as the tree has changed it, so passives carry through the chain', (): void => {
  const world: World = fresh();
  assert.ok(cleave.delivery.type === 'arc');
  const widened: SkillDef = { ...cleave, delivery: { ...cleave.delivery, reach: cleave.delivery.reach * 1.4 }, damage: { ...cleave.damage, weaponPercent: cleave.damage.weaponPercent * 2 } };
  const chain = { ...world.player, combo: { skill: 'cleave', hits: 2, timeLeft: 1 } };
  const plain: SkillDef = chainedSkill(chain, cleave);
  const wide: SkillDef = chainedSkill(chain, widened);
  assert.ok(plain.delivery.type === 'arc' && wide.delivery.type === 'arc');
  assert.ok(Math.abs(wide.delivery.reach / plain.delivery.reach - 1.4) < 1e-9);
  assert.ok(Math.abs(wide.damage.weaponPercent / plain.damage.weaponPercent - 2) < 1e-9);
  assert.equal(wide.id, 'cleave');
});

void test('comboHits counts only a live chain of the same skill', (): void => {
  const world: World = fresh();
  const bolt: SkillDef = must(content.skills.get('storm_bolt'), 'storm_bolt');
  assert.equal(comboHits(world.player, cleave), 0);
  assert.equal(comboHits({ ...world.player, combo: { skill: 'cleave', hits: 1, timeLeft: 0.2 } }, cleave), 1);
  assert.equal(comboHits({ ...world.player, combo: { skill: 'cleave', hits: 1, timeLeft: 0 } }, cleave), 0);
  assert.equal(comboHits({ ...world.player, combo: { skill: 'cleave', hits: steps.length + 1, timeLeft: 0.2 } }, cleave), 0);
  assert.equal(comboHits({ ...world.player, combo: { skill: 'storm_bolt', hits: 1, timeLeft: 0.2 } }, cleave), 0);
  assert.equal(comboHits({ ...world.player, combo: { skill: 'storm_bolt', hits: 1, timeLeft: 0.2 } }, bolt), 0);
});

void test('a leap crouches first, then flies to where the hero stood and lands there', (): void => {
  const world: World = arena(6);
  const ghoul: MonsterState = place(world, 'test_ghoul', { x: ARENA_CENTRE.x + 7, z: ARENA_CENTRE.z });
  const pounce: SkillDef = must(world.content.skills.get('test_pounce'), 'pounce');
  const leap = must(pounce.leap, 'leap');
  const from: Vec2 = { ...ghoul.pos };
  const hero: Vec2 = { ...world.player.pos };
  startSkill(world, ghoul, pounce, { x: hero.x - from.x, z: hero.z - from.z });
  const landing: Vec2 = must(ghoul.action?.target, 'landing point');
  assert.ok(Math.abs(distance(landing, hero) - leap.stopShort) < 0.05, 'it aims to land just short of the hero');
  for (let step: number = 0; step < Math.round((pounce.windup - leap.airTime - 0.05) / DT); step += 1) {
    world.player.pos = { ...hero };
    stepWorld(world, [], DT);
  }
  assert.ok(distance(from, ghoul.pos) < 0.05, 'it holds still while it crouches');
  const life: number = world.player.life;
  for (let step: number = 0; step < Math.round((leap.airTime + 0.1) / DT); step += 1) {
    world.player.pos = { ...hero };
    stepWorld(world, [], DT);
  }
  assert.ok(distance(landing, ghoul.pos) < 0.3, `it landed at the mark (${distance(landing, ghoul.pos).toFixed(2)} away)`);
  assert.ok(world.player.life < life, 'the landing hits a hero who stayed');
});

void test('a hero who steps aside is missed: the leap still lands where the hero was', (): void => {
  const world: World = arena(7);
  const ghoul: MonsterState = place(world, 'test_ghoul', { x: ARENA_CENTRE.x + 7, z: ARENA_CENTRE.z });
  const pounce: SkillDef = must(world.content.skills.get('test_pounce'), 'pounce');
  startSkill(world, ghoul, pounce, { x: world.player.pos.x - ghoul.pos.x, z: world.player.pos.z - ghoul.pos.z });
  const landing: Vec2 = must(ghoul.action?.target, 'landing point');
  const life: number = world.player.life;
  for (let step: number = 0; step < Math.round((pounce.windup + 0.1) / DT); step += 1) {
    world.player.pos = { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z + 5 };
    stepWorld(world, [], DT);
  }
  assert.ok(distance(landing, ghoul.pos) < 0.3);
  assert.equal(world.player.life, life);
});

void test('a leap toward a wall plans its landing short of the wall, and lands where it showed', (): void => {
  const world: World = arena(8);
  const ghoul: MonsterState = place(world, 'test_ghoul', { x: 3, z: ARENA_CENTRE.z });
  const pounce: SkillDef = must(world.content.skills.get('test_pounce'), 'pounce');
  startSkill(world, ghoul, pounce, { x: -8, z: 0 });
  const landing: Vec2 = must(ghoul.action?.target, 'landing point');
  assert.ok(landing.x > 0, `the landing stays on the floor (${landing.x.toFixed(2)})`);
  for (let step: number = 0; step < Math.round((pounce.windup + 0.05) / DT); step += 1) stepWorld(world, [], DT);
  assert.ok(distance(landing, ghoul.pos) < 0.01, `it landed at the mark (${distance(landing, ghoul.pos).toFixed(2)} away)`);
});

void test('a leap never lands through a wall raised across its path', (): void => {
  const world: World = arena(9);
  const ghoul: MonsterState = place(world, 'test_ghoul', { x: ARENA_CENTRE.x + 7, z: ARENA_CENTRE.z });
  const pounce: SkillDef = must(world.content.skills.get('test_pounce'), 'pounce');
  const from: Vec2 = { ...ghoul.pos };
  startSkill(world, ghoul, pounce, { x: -6, z: 0 });
  const landing: Vec2 = must(ghoul.action?.target, 'landing point');
  const wallX: number = (from.x + landing.x) / 2;
  for (let z: number = 0; z < world.grid.rows * world.grid.cellSize; z += world.grid.cellSize) {
    const index: number = cellIndex(world.grid, wallX, z);
    world.grid.solid[index] = 1;
    world.grid.walkable[index] = 0;
  }
  for (let step: number = 0; step < Math.round((pounce.windup + 0.05) / DT); step += 1) stepWorld(world, [], DT);
  assert.ok(ghoul.pos.x > wallX, `it stayed on its own side of the wall (${ghoul.pos.x.toFixed(2)} against ${wallX.toFixed(2)})`);
});

void test('a charged skill waits while its key is held and hits harder and wider the longer it was held', (): void => {
  const quick: World = shapeArena(['test_heave']);
  const tapped: MonsterState = dummy(quick, offset(2, 0));
  const tapEvents: WorldEvent[] = [...stepWorld(quick, [{ type: 'skill', slot: 0, aim: offset(2, 0), targetId: null }], DT), ...run(quick, 0.4)];
  const held: World = shapeArena(['test_heave']);
  const struck: MonsterState = dummy(held, offset(2, 0));
  stepWorld(held, [{ type: 'hold', slot: 0, down: true }, { type: 'skill', slot: 0, aim: offset(2, 0), targetId: null }], DT);
  const waiting: WorldEvent[] = run(held, 0.7);
  assert.equal(damageTo(waiting, struck.id).length, 0);
  assert.equal(held.player.action?.phase, 'windup');
  const released: WorldEvent[] = [...stepWorld(held, [{ type: 'hold', slot: 0, down: false }], DT), ...run(held, 0.3)];
  const light: number = must(damageTo(tapEvents, tapped.id)[0], 'tap hit');
  const heavy: number = must(damageTo(released, struck.id)[0], 'held hit');
  assert.ok(heavy > light * 2);
  const full = chargedSkill(shapeSkill('test_heave'), 1).delivery;
  assert.equal(full.type === 'arc' ? full.reach : 0, 4.5);
});

void test('a charge held past its limit releases on its own', (): void => {
  const world: World = shapeArena(['test_heave']);
  const struck: MonsterState = dummy(world, offset(2, 0));
  stepWorld(world, [{ type: 'hold', slot: 0, down: true }, { type: 'skill', slot: 0, aim: offset(2, 0), targetId: null }], DT);
  const events: WorldEvent[] = run(world, 1.4);
  assert.equal(damageTo(events, struck.id).length, 1);
});

void test('a channelled skill keeps striking while held, pays each tick, and stops on release', (): void => {
  const world: World = shapeArena(['test_wire']);
  const struck: MonsterState = dummy(world, offset(0, 5));
  world.player.stats = { ...world.player.stats, manaRegen: 0 };
  const mana: number = world.player.mana;
  stepWorld(world, [{ type: 'hold', slot: 0, down: true }, { type: 'skill', slot: 0, aim: offset(0, 5), targetId: null }], DT);
  const during: WorldEvent[] = run(world, 1.05);
  assert.equal(world.player.action?.phase, 'channel');
  const ticks: number = damageTo(during, struck.id).length;
  assert.ok(ticks >= 5 && ticks <= 6);
  assert.equal(world.player.mana, mana - 2 * ticks);
  const after: WorldEvent[] = [...stepWorld(world, [{ type: 'hold', slot: 0, down: false }], DT), ...run(world, 0.6)];
  assert.ok(damageTo(after, struck.id).length <= 1);
  assert.equal(world.player.action, null);
});

void test('a channel tapped and let go before its windup ends strikes once and recovers', (): void => {
  const world: World = shapeArena(['test_wire']);
  const struck: MonsterState = dummy(world, offset(0, 5));
  const events: WorldEvent[] = [...stepWorld(world, [{ type: 'hold', slot: 0, down: true }, { type: 'skill', slot: 0, aim: offset(0, 5), targetId: null }, { type: 'hold', slot: 0, down: false }], DT), ...run(world, 1)];
  assert.equal(damageTo(events, struck.id).length, 1);
  assert.equal(world.player.action, null);
});

void test('a channel can be steered while held', (): void => {
  const world: World = shapeArena(['test_wire']);
  const ahead: MonsterState = dummy(world, offset(0, 5));
  const beside: MonsterState = dummy(world, offset(5, 0));
  stepWorld(world, [{ type: 'hold', slot: 0, down: true }, { type: 'skill', slot: 0, aim: offset(0, 5), targetId: null }], DT);
  run(world, 0.3);
  const steered: WorldEvent[] = run(world, 0.6, [{ type: 'steer', aim: offset(5, 0) }]);
  assert.ok(damageTo(steered, beside.id).length >= 2);
  assert.ok(damageTo(steered, ahead.id).length <= 1);
});

void test('steering a channel that lands at its aim moves where the next pulse lands', (): void => {
  const world: World = shapeArena(['test_squall']);
  const squall: SkillDef = shapeSkill('test_squall');
  world.player.skills = [{ ...squall, id: 'test_rain', cooldown: 0, press: { type: 'channel', interval: 0.2, max: 2 } }];
  stepWorld(world, [{ type: 'hold', slot: 0, down: true }, { type: 'skill', slot: 0, aim: offset(0, 6), targetId: null }], DT);
  run(world, 0.3);
  const steered: WorldEvent[] = run(world, 0.5, [{ type: 'steer', aim: offset(6, 0) }]);
  const placed: AreaState[] = steered.flatMap((event: WorldEvent): AreaState[] => (event.type === 'area' && event.stage === 'start' ? [event.area] : []));
  assert.ok(placed.length >= 1);
  for (const area of placed) assert.ok(distance(area.pos, offset(6, 0)) < 0.5);
});

void test('a channel ends when mana runs out', (): void => {
  const world: World = shapeArena(['test_wire']);
  world.player.mana = 5;
  world.player.stats = { ...world.player.stats, manaRegen: 0 };
  stepWorld(world, [{ type: 'hold', slot: 0, down: true }, { type: 'skill', slot: 0, aim: offset(0, 5), targetId: null }], DT);
  const events: WorldEvent[] = run(world, 1.5);
  assert.equal(world.player.action, null);
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'notice' && event.reason === 'no_mana'));
});

void test('every changed form the chart offers lands on an enemy when cast at it, and an echoed form lands twice', (): void => {
  for (const node of SHAPE_CONTENT.skillTree) {
    if (node.variant === null) continue;
    const changed: SkillDef = resolveSkill(SHAPE_CONTENT, must(SHAPE_CONTENT.skills.get(node.variant.skill), node.variant.skill), [node.id]);
    if (changed.press !== null || changed.delivery.type === 'dash') continue;
    const world: World = shapeArena([]);
    world.player.skills = [changed];
    const target: MonsterState = dummy(world, offset(3, 0));
    const events: WorldEvent[] = run(world, 2.5, [{ type: 'skill', slot: 0, aim: target.pos, targetId: target.id }]);
    const hits: number[] = damageTo(events, target.id);
    assert.ok(hits.length > 0, `${node.id} lands`);
    if (changed.echo > 0) assert.ok(hits.length >= 2, `${node.id} echoes`);
  }
});
