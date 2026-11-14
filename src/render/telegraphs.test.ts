import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Object3D } from 'three';
import { Color, Group, Mesh, ShaderMaterial } from 'three';
import type { SkillDef } from '../../sim/content/types.ts';
import type { HazardState, MonsterState, World } from '../../sim/world/types.ts';
import { offenceOf } from '../../sim/world/combat.ts';
import { placeHazard } from '../../sim/world/hazards.ts';
import { arena, place } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import type { Telegraphs } from './telegraphs.ts';
import { createTelegraphs, fieldGlow, settleLevel, telegraphEase, telegraphFlare, telegraphGlow, telegraphGrain, TELEGRAPHS } from './telegraphs.ts';

const RED: Color = new Color(0xc65a4a);
const STEP: number = 1 / 60;

interface Lit {
  readonly strength: number;
  readonly front: number;
}

function lightsOf(parent: Object3D): Lit[] {
  const found: Lit[] = [];
  parent.traverse((object: Object3D): void => {
    if (!(object instanceof Mesh)) return;
    const material: unknown = object.material;
    if (!(material instanceof ShaderMaterial)) return;
    const strength: unknown = material.uniforms['uStrength']?.value;
    const front: unknown = material.uniforms['uFront']?.value;
    if (typeof strength === 'number') found.push({ strength, front: typeof front === 'number' ? front : 1 });
  });
  return found;
}

function windingUp(world: World, monster: MonsterState, windup: number): SkillDef {
  const skill: SkillDef = must(world.content.skills.get('test_slam'), 'test_slam');
  monster.action = { skill, phase: 'windup', timeLeft: windup, windup, recovery: 0.5, direction: { x: 0, z: 1 }, target: null, travelSpeed: 0, travelLeft: 0, slot: null, elapsed: 0 };
  return skill;
}

void test('a telegraph eases in from nothing instead of popping', (): void => {
  assert.equal(telegraphEase(0, 1), 0);
  assert.ok(telegraphEase(TELEGRAPHS.easeIn / 2, 1) > 0);
  assert.ok(telegraphEase(TELEGRAPHS.easeIn / 2, 1) < 1);
  assert.equal(telegraphEase(TELEGRAPHS.easeIn, 1), 1);
  assert.ok(telegraphEase(0.05, 0.2) > telegraphEase(0.05, 2));
});

void test('the light gathers as the hit nears and flares only in its last moment', (): void => {
  assert.ok(telegraphGlow(1, 1, 0) > telegraphGlow(0, 1, 0));
  assert.ok(telegraphGlow(0, 1, 0) > 0);
  assert.equal(telegraphFlare(TELEGRAPHS.flareTime), 0);
  assert.equal(telegraphFlare(0), 1);
  assert.ok(telegraphGlow(1, 0, 0) <= TELEGRAPHS.peak + TELEGRAPHS.flare);
  assert.ok(telegraphGrain(1) > telegraphGrain(0));
});

void test('a field breathes slowly and never goes dark while it lasts', (): void => {
  for (let age: number = 0; age < 6; age += 0.25) assert.ok(fieldGlow(age) > TELEGRAPHS.fieldGlow * (1 - TELEGRAPHS.fieldBreathe) - 1e-9);
  assert.notEqual(fieldGlow(0), fieldGlow(1));
});

void test('a settling telegraph fades out over its settle time', (): void => {
  assert.equal(settleLevel(-1), 1);
  assert.equal(settleLevel(0), 1);
  assert.ok(settleLevel(TELEGRAPHS.settle / 2) < 1);
  assert.equal(settleLevel(TELEGRAPHS.settle), 0);
});

void test('a telegraph is one light over the whole area from the start, with no line or growing front', (): void => {
  const world: World = arena(3);
  const monster: MonsterState = place(world, 'test_brute', { x: 14, z: 17 });
  const skill: SkillDef = windingUp(world, monster, 1);
  const parent: Group = new Group();
  const telegraphs: Telegraphs = createTelegraphs(parent);
  telegraphs.start(monster.id, 'actor', monster.pos, { x: 0, z: 1 }, skill, 1, RED);
  const action = must(monster.action, 'action');
  const seen: number[] = [];
  for (const left of [0.9, 0.5, 0.05]) {
    action.timeLeft = left;
    for (let frame: number = 0; frame < 12; frame += 1) telegraphs.update(STEP, world);
    const lights: Lit[] = lightsOf(parent);
    assert.equal(lights.length, 1);
    const [light] = lights;
    assert.ok(light !== undefined);
    assert.equal(light.front, 1);
    seen.push(light.strength);
  }
  assert.ok(must(seen[1], 'mid') > must(seen[0], 'early'));
  assert.ok(must(seen[2], 'late') > must(seen[1], 'mid'));
});

void test('a telegraph settles away once the windup ends and is gone after its settle time', (): void => {
  const world: World = arena(4);
  const monster: MonsterState = place(world, 'test_brute', { x: 14, z: 17 });
  const skill: SkillDef = windingUp(world, monster, 0.5);
  const telegraphs: Telegraphs = createTelegraphs(new Group());
  telegraphs.start(monster.id, 'actor', monster.pos, { x: 0, z: 1 }, skill, 0.5, RED);
  for (let frame: number = 0; frame < 20; frame += 1) telegraphs.update(STEP, world);
  assert.equal(telegraphs.active, 1);
  monster.action = null;
  telegraphs.update(STEP, world);
  assert.equal(telegraphs.active, 1);
  for (let frame: number = 0; frame < Math.ceil(TELEGRAPHS.settle / STEP) + 1; frame += 1) telegraphs.update(STEP, world);
  assert.equal(telegraphs.active, 0);
});

void test('a field glows while its hazard lasts and fades once it is gone', (): void => {
  const world: World = arena(5);
  const monster: MonsterState = place(world, 'timekeeper_adept', { x: 14, z: 17 });
  const hazard: HazardState = must(placeHazard(world, offenceOf(monster), must(world.content.skills.get('keeper_field'), 'keeper_field'), { x: 14, z: 14 }), 'field');
  const parent: Group = new Group();
  const telegraphs: Telegraphs = createTelegraphs(parent);
  telegraphs.field(hazard.id, hazard.pos, 3, RED);
  for (let frame: number = 0; frame < 30; frame += 1) telegraphs.update(STEP, world);
  const held: number = must(lightsOf(parent)[0], 'field light').strength;
  assert.ok(held > 0);
  world.hazards = [];
  telegraphs.update(STEP, world);
  assert.equal(telegraphs.active, 1);
  for (let frame: number = 0; frame < Math.ceil(TELEGRAPHS.fieldSettle / STEP) + 1; frame += 1) telegraphs.update(STEP, world);
  assert.equal(telegraphs.active, 0);
});
