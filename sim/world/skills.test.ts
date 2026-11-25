import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, arena, place } from '../../test/arena-support.ts';
import { faceAt } from '../../test/facing-support.ts';
import { must } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { ComboStep, Content, SkillDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { cellIndex } from '../nav/grid.ts';
import { chainedSkill, chargedSkill, clearProjectiles, comboHits, readyToRepeat, startSkill, volleyOrder } from './skills.ts';
import { damageTo, dummy, offset, run, SHAPE_CONTENT, shapeArena, shapeSkill } from '../../test/shape-support.ts';
import { resolveSkill } from '../stats.ts';
import { generateItem } from '../items.ts';
import { createRng } from '../rng.ts';
import { stepWorld } from './step.ts';
import type { ActorState, AreaState, Command, MonsterState, ProjectileState, World, WorldEvent } from './types.ts';

const content: Content = loadContent();
const DT: number = 1 / 60;
const cleave: SkillDef = must(content.skills.get('cleave'), 'cleave');
const steps: readonly ComboStep[] = must(cleave.combo, 'cleave combo').steps;
const SWING_AIM: Vec2 = { x: 28, z: 30 };
const swing: Command = { type: 'skill', slot: 0, aim: SWING_AIM, targetId: null };

type Start = Extract<WorldEvent, { readonly type: 'skill_start' }>;

function fresh(): World {
  return arena(3);
}

function swingOnce(world: World): Start {
  faceAt(world.player, SWING_AIM);
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

function burningSkill(actor: ActorState): string | null {
  return actor.burn === null ? null : actor.burn.skill.id;
}

void test('a leap that leaves burning ground lays it where it landed, and it burns a hero who stays', (): void => {
  const pounce: SkillDef = must(content.skills.get('cinder_pounce'), 'cinder_pounce');
  const left: SkillDef = must(content.skills.get(must(pounce.leaves, 'what it leaves')), 'patch');
  const world: World = arena(8);
  const ghoul: MonsterState = place(world, 'test_ghoul', { x: ARENA_CENTRE.x + 7, z: ARENA_CENTRE.z });
  const leaping: SkillDef = { ...must(world.content.skills.get('test_pounce'), 'pounce'), leaves: left.id };
  const hero: Vec2 = { ...world.player.pos };
  startSkill(world, ghoul, leaping, { x: hero.x - ghoul.pos.x, z: hero.z - ghoul.pos.z });
  const landing: Vec2 = must(ghoul.action?.target, 'landing point');
  for (let step: number = 0; step < Math.round((leaping.windup + 0.1) / DT); step += 1) {
    world.player.pos = { ...hero };
    stepWorld(world, [], DT);
  }
  const patch: AreaState = must(world.areas.find((area: AreaState): boolean => area.skill.id === left.id), 'burning ground');
  assert.equal(patch.ownerId, ghoul.id);
  assert.ok(distance(patch.pos, landing) < 0.3, 'the ground burns where it landed');
  Object.assign(world.player, { burn: null });
  for (let step: number = 0; step < Math.round(0.9 / DT); step += 1) {
    world.player.pos = { ...hero };
    stepWorld(world, [], DT);
  }
  assert.equal(burningSkill(world.player), left.id, 'a hero who stays in it is set alight by the ground');
  assert.equal(world.areas.filter((area: AreaState): boolean => area.skill.id === left.id).length, 1, 'an echo-free leap leaves one patch');
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
    world.grid.ground[index] = 0;
  }
  for (let step: number = 0; step < Math.round((pounce.windup + 0.05) / DT); step += 1) stepWorld(world, [], DT);
  assert.ok(ghoul.pos.x > wallX, `it stayed on its own side of the wall (${ghoul.pos.x.toFixed(2)} against ${wallX.toFixed(2)})`);
});

void test('a charged skill waits while its key is held and hits harder and wider the longer it was held', (): void => {
  const quick: World = shapeArena(['test_heave']);
  const tapped: MonsterState = dummy(quick, offset(2, 0));
  faceAt(quick.player, offset(2, 0));
  const tapEvents: WorldEvent[] = [...stepWorld(quick, [{ type: 'skill', slot: 0, aim: offset(2, 0), targetId: null }], DT), ...run(quick, 0.4)];
  const held: World = shapeArena(['test_heave']);
  const struck: MonsterState = dummy(held, offset(2, 0));
  faceAt(held.player, offset(2, 0));
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

void test('a fully charged Heavy Quarrel flies as a bolt wider by its charge area, and a tap stays as narrow as the plain bolt', (): void => {
  const heave: SkillDef = must(content.skills.get('quarrel_heave'), 'quarrel_heave');
  const hold = heave.press;
  assert.ok(hold?.type === 'charge' && heave.delivery.type === 'projectile');
  const full = chargedSkill(heave, 1).delivery;
  const half = chargedSkill(heave, 0.5).delivery;
  assert.ok(full.type === 'projectile' && half.type === 'projectile');
  assert.ok(Math.abs(full.radius - heave.delivery.radius * hold.areaScale) < 1e-9);
  assert.ok(Math.abs(half.radius - heave.delivery.radius * (1 + (hold.areaScale - 1) / 2)) < 1e-9);
  assert.equal(chargedSkill(heave, 0).delivery, heave.delivery);
});

void test('a charge held past its limit releases on its own', (): void => {
  const world: World = shapeArena(['test_heave']);
  const struck: MonsterState = dummy(world, offset(2, 0));
  faceAt(world.player, offset(2, 0));
  stepWorld(world, [{ type: 'hold', slot: 0, down: true }, { type: 'skill', slot: 0, aim: offset(2, 0), targetId: null }], DT);
  const events: WorldEvent[] = run(world, 1.4);
  assert.equal(damageTo(events, struck.id).length, 1);
});

void test('a channelled skill keeps striking while held, pays each tick, and stops on release', (): void => {
  const world: World = shapeArena(['test_wire']);
  const struck: MonsterState = dummy(world, offset(0, 5));
  world.player.stats = { ...world.player.stats, manaRegen: 0 };
  const mana: number = world.player.mana;
  faceAt(world.player, offset(0, 5));
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
  faceAt(world.player, offset(0, 5));
  const events: WorldEvent[] = [...stepWorld(world, [{ type: 'hold', slot: 0, down: true }, { type: 'skill', slot: 0, aim: offset(0, 5), targetId: null }, { type: 'hold', slot: 0, down: false }], DT), ...run(world, 1)];
  assert.equal(damageTo(events, struck.id).length, 1);
  assert.equal(world.player.action, null);
});

void test('a channel can be steered while held', (): void => {
  const world: World = shapeArena(['test_wire']);
  const ahead: MonsterState = dummy(world, offset(0, 5));
  const beside: MonsterState = dummy(world, offset(5, 0));
  faceAt(world.player, offset(0, 5));
  stepWorld(world, [{ type: 'hold', slot: 0, down: true }, { type: 'skill', slot: 0, aim: offset(0, 5), targetId: null }], DT);
  run(world, 0.3);
  const steered: WorldEvent[] = run(world, 0.6, [{ type: 'steer', aim: offset(5, 0) }]);
  assert.ok(damageTo(steered, beside.id).length >= 2);
  assert.ok(damageTo(steered, ahead.id).length <= 1);
});

void test('steering a channel that lands at its aim moves where the next pulse lands', (): void => {
  const world: World = shapeArena(['test_squall']);
  const squall: SkillDef = shapeSkill('test_squall');
  world.player.skills = [{ ...squall, id: 'test_rain', cooldown: 0, press: { type: 'channel', interval: 0.2, max: 2, move: 0, passThrough: false, hint: null } }];
  faceAt(world.player, offset(0, 6));
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
  for (const node of SHAPE_CONTENT.skillTree) for (const variant of node.variants) {
    const changed: SkillDef = resolveSkill(SHAPE_CONTENT, must(SHAPE_CONTENT.skills.get(variant.skill), variant.skill), [node.id]);
    if (changed.press !== null || changed.delivery.type === 'dash' || (changed.delivery.type === 'area' && changed.delivery.aura !== null)) continue;
    const world: World = shapeArena([]);
    world.player.skills = [changed];
    const target: MonsterState = dummy(world, offset(3, 0));
    const events: WorldEvent[] = run(world, 2.5, [{ type: 'skill', slot: 0, aim: target.pos, targetId: target.id }]);
    const hits: number[] = damageTo(events, target.id);
    assert.ok(hits.length > 0, `${node.id} lands`);
    if (changed.echo > 0) assert.ok(hits.length >= 2, `${node.id} echoes`);
  }
});

void test('a held skill repeats only when the hero is free, it is off cooldown, he has the mana and it is not a press skill', (): void => {
  const world: World = fresh();
  const bolt: SkillDef = must(content.skills.get('storm_bolt'), 'storm_bolt');
  const pressed: SkillDef = must(content.skills.get('thunderhead'), 'thunderhead');
  world.player.mana = bolt.manaCost;
  assert.equal(readyToRepeat(world.player, bolt), true);
  assert.equal(readyToRepeat(world.player, null), false);
  assert.equal(readyToRepeat(world.player, undefined), false);
  assert.equal(readyToRepeat(world.player, pressed), false);
  world.player.mana = bolt.manaCost - 1;
  assert.equal(readyToRepeat(world.player, bolt), false);
  world.player.mana = bolt.manaCost;
  world.player.cooldowns[bolt.id] = 0.5;
  assert.equal(readyToRepeat(world.player, bolt), false);
  world.player.cooldowns[bolt.id] = 0;
  swingOnce(world);
  stepWorld(world, [swing], DT);
  assert.notEqual(world.player.action, null);
  assert.equal(readyToRepeat(world.player, bolt), false);
});

void test('a hero in the Mist-Treader Boots leaves a Downdraught where a roll lands, and not once the boots are off', (): void => {
  const world: World = arena(7);
  const boots = must(generateItem(world.content, createRng(7), 900, 8, 'mist_treader_boots', null), 'boots');
  world.player.equipped.feet = boots;
  const step: SkillDef = must(world.content.skills.get('dodge_roll'), 'dodge roll');
  const from: Vec2 = { ...world.player.pos };
  startSkill(world, world.player, step, { x: 3, z: 0 });
  const fell: AreaState[] = [];
  for (let frame: number = 0; frame < Math.round((step.windup + 0.4) / DT) && fell.length === 0; frame += 1) {
    stepWorld(world, [], DT);
    fell.push(...world.areas.filter((area: AreaState): boolean => area.skill.id === 'downdraught'));
  }
  const area: AreaState = must(fell[0], 'a Downdraught fell');
  assert.ok(distance(area.pos, world.player.pos) < 0.05, `it fell where the hero landed (${distance(area.pos, world.player.pos).toFixed(2)} away)`);
  assert.ok(distance(world.player.pos, from) > 1, 'the hero rolled away from the start');
  world.areas = [];
  world.player.equipped.feet = null;
  world.player.cooldowns = {};
  startSkill(world, world.player, step, { x: -3, z: 0 });
  for (let frame: number = 0; frame < Math.round((step.windup + 0.4) / DT); frame += 1) stepWorld(world, [], DT);
  assert.equal(world.areas.filter((late: AreaState): boolean => late.skill.id === 'downdraught').length, 0);
});

void test('a volley order keeps the fan in order when its shots leave together and scatters it when they leave one by one', (): void => {
  assert.deepEqual(volleyOrder(5, 0), [0, 1, 2, 3, 4]);
  assert.deepEqual(volleyOrder(6, 0.016), [0, 5, 2, 4, 1, 3]);
});

void test('Wisp Volley looses its six wisps one after another from the release, across a narrow fan, within its interval span', (): void => {
  const wisp: SkillDef = shapeSkill('wisp_volley');
  assert.equal(wisp.delivery.type, 'projectile');
  const step: number = 1 / 600;
  const world: World = shapeArena(['wisp_volley']);
  const spawned: { readonly at: number; readonly angle: number }[] = [];
  const marks: { released: number | null } = { released: null };
  let clock: number = 0;
  const watch = (events: readonly WorldEvent[]): void => {
    for (const event of events) {
      if (event.type === 'skill_impact') marks.released = clock;
      if (event.type === 'projectile_spawn') spawned.push({ at: clock, angle: Math.atan2(event.projectile.direction.x, event.projectile.direction.z) });
    }
  };
  faceAt(world.player, offset(0, 8));
  watch(stepWorld(world, [{ type: 'skill', slot: 0, aim: offset(0, 8), targetId: null }], step));
  for (let index: number = 0; index < 600 && spawned.length < wisp.delivery.count; index += 1) {
    clock += step;
    watch(stepWorld(world, [], step));
  }
  const release: number = must(marks.released, 'released');
  assert.ok(Math.abs(release - wisp.windup) < step * 2);
  assert.equal(spawned.length, wisp.delivery.count);
  assert.ok(Math.abs((spawned[0]?.at ?? -1) - release) < step);
  const span: number = (wisp.delivery.count - 1) * wisp.delivery.interval;
  assert.ok(Math.abs((spawned.at(-1)?.at ?? -1) - release - span) < step * 2);
  const angles: number[] = spawned.map((shot: { readonly angle: number }): number => shot.angle);
  const sorted: number[] = angles.toSorted((a: number, b: number): number => a - b);
  assert.notDeepEqual(angles, sorted);
  assert.ok((sorted.at(-1) ?? 0) - (sorted[0] ?? 0) <= (wisp.delivery.count - 1) * wisp.delivery.spreadDegrees * (Math.PI / 180) + 1e-9);
});

void test('a queued shot that leaves partway through a long frame flies only the rest of that frame, so the volley keeps its spacing', (): void => {
  const wisp: SkillDef = shapeSkill('wisp_volley');
  const delivery = wisp.delivery;
  assert.equal(delivery.type, 'projectile');
  const frame: number = 1 / 30;
  const world: World = shapeArena(['wisp_volley']);
  faceAt(world.player, offset(0, 8));
  stepWorld(world, [{ type: 'skill', slot: 0, aim: offset(0, 8), targetId: null }], frame);
  for (let index: number = 0; index < 60 && (world.shots.length > 0 || world.projectiles.length < delivery.count); index += 1) stepWorld(world, [], frame);
  assert.equal(world.projectiles.length, delivery.count);
  const flown: number[] = world.projectiles.map((projectile: ProjectileState): number => delivery.range - projectile.distanceLeft).toSorted((a: number, b: number): number => b - a);
  for (const [rank, distanceFlown] of flown.entries()) {
    const lead: number = must(flown[0], 'first wisp') - distanceFlown;
    assert.ok(Math.abs(lead - rank * delivery.interval * delivery.speed) < 0.05, `wisp ${rank} trails the first by ${lead.toFixed(3)} m`);
  }
});

void test('Wisp Volley lands several wisps on one enemy ahead, each a hit of its own', (): void => {
  const world: World = shapeArena(['wisp_volley']);
  const target: MonsterState = dummy(world, offset(0, 8));
  const events: WorldEvent[] = run(world, 2, [{ type: 'skill', slot: 0, aim: target.pos, targetId: null }]);
  assert.ok(damageTo(events, target.id).length >= 2);
});

void test('queued shots that have not left yet are dropped with the flying ones', (): void => {
  const world: World = shapeArena(['wisp_volley']);
  faceAt(world.player, offset(0, 8));
  stepWorld(world, [{ type: 'skill', slot: 0, aim: offset(0, 8), targetId: null }], 1 / 60);
  run(world, shapeSkill('wisp_volley').windup + 1 / 120);
  assert.ok(world.shots.length > 0);
  clearProjectiles(world);
  assert.equal(world.shots.length, 0);
  assert.equal(run(world, 0.2).filter((event: WorldEvent): boolean => event.type === 'projectile_spawn').length, 0);
});

void test('Ghost Wave rolls through every enemy in its lane once, reaching the far one later than the near one', (): void => {
  const world: World = shapeArena(['ghost_wave']);
  const near: MonsterState = dummy(world, offset(0, 3));
  const far: MonsterState = dummy(world, offset(0.8, 10));
  const aside: MonsterState = dummy(world, offset(5, 6));
  const struck: Map<number, number> = new Map<number, number>();
  let clock: number = 0;
  const watch = (events: readonly WorldEvent[]): void => {
    for (const event of events) if (event.type === 'damage' && !struck.has(event.targetId)) struck.set(event.targetId, clock);
  };
  faceAt(world.player, offset(0, 10));
  watch(stepWorld(world, [{ type: 'skill', slot: 0, aim: offset(0, 10), targetId: null }], 1 / 60));
  for (let step: number = 0; step < 120; step += 1) {
    clock += 1 / 60;
    watch(stepWorld(world, [], 1 / 60));
  }
  const nearAt: number = must(struck.get(near.id), 'near hit');
  const farAt: number = must(struck.get(far.id), 'far hit');
  assert.ok(farAt - nearAt > 0.3);
  assert.equal(struck.has(aside.id), false);
  assert.equal(damageTo(run(world, 1), near.id).length, 0);
});

void test('Spell Strike lands on the enemy ahead the moment its windup ends, with nothing in flight', (): void => {
  const strike: SkillDef = shapeSkill('spell_strike');
  const step: number = 1 / 600;
  const world: World = shapeArena(['spell_strike']);
  const target: MonsterState = dummy(world, offset(0, 8));
  const marks: { struck: number | null } = { struck: null };
  let clock: number = 0;
  const watch = (events: readonly WorldEvent[]): void => {
    for (const event of events) if (event.type === 'damage' && event.targetId === target.id && marks.struck === null) marks.struck = clock;
  };
  faceAt(world.player, target.pos);
  watch(stepWorld(world, [{ type: 'skill', slot: 0, aim: target.pos, targetId: null }], step));
  for (let index: number = 0; index < 600 && marks.struck === null; index += 1) {
    clock += step;
    watch(stepWorld(world, [], step));
  }
  assert.ok(Math.abs(must(marks.struck, 'struck') - strike.windup) < step * 2);
  assert.equal(world.projectiles.length, 0);
});

void test('an echo with a turn repeats the skill turned by that many degrees from the first strike', (): void => {
  const world: World = arena(7);
  const turner: MonsterState = place(world, 'test_turner', { x: ARENA_CENTRE.x + 2, z: ARENA_CENTRE.z });
  const seen: WorldEvent[] = [];
  for (let step: number = 0; step < 90; step += 1) {
    world.player.pos = { ...ARENA_CENTRE };
    world.player.life = world.player.maxLife;
    seen.push(...stepWorld(world, [], 1 / 30));
  }
  const impacts = seen.filter((event: WorldEvent): event is Extract<WorldEvent, { readonly type: 'skill_impact' }> => event.type === 'skill_impact' && event.actorId === turner.id);
  const first = must(impacts.find((event): boolean => !event.echo), 'first strike');
  const echo = must(impacts.find((event): boolean => event.echo), 'echo');
  const turned: number = Math.atan2(first.direction.x * echo.direction.z - first.direction.z * echo.direction.x, first.direction.x * echo.direction.x + first.direction.z * echo.direction.z);
  assert.ok(Math.abs(Math.abs(turned) - Math.PI / 2) < 1e-6, `the echo is turned a quarter, not ${turned}`);
});
