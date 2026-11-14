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
import { createTelegraphs, settleLevel, telegraphEase, telegraphEdge, TELEGRAPHS } from './telegraphs.ts';

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

void test('the edge grows stronger as the hit nears', (): void => {
  assert.ok(telegraphEdge(1, 0) > telegraphEdge(0, 0));
  assert.ok(telegraphEdge(0, 0) > 0);
});

void test('a settling telegraph fades out over its settle time', (): void => {
  assert.equal(settleLevel(-1), 1);
  assert.equal(settleLevel(0), 1);
  assert.ok(settleLevel(TELEGRAPHS.settle / 2) < 1);
  assert.equal(settleLevel(TELEGRAPHS.settle), 0);
});

void test('the edge marks the whole area from the start and the sweep follows the windup', (): void => {
  const world: World = arena(3);
  const monster: MonsterState = place(world, 'test_brute', { x: 14, z: 17 });
  const skill: SkillDef = windingUp(world, monster, 1);
  const parent: Group = new Group();
  const telegraphs: Telegraphs = createTelegraphs(parent);
  telegraphs.start(monster.id, 'actor', monster.pos, { x: 0, z: 1 }, skill, 1, RED);
  const action = must(monster.action, 'action');
  action.timeLeft = 0.5;
  telegraphs.update(STEP, world);
  const [edge, sweep] = lightsOf(parent);
  assert.ok(edge !== undefined && sweep !== undefined);
  assert.equal(edge.front, 1);
  assert.ok(Math.abs(sweep.front - 0.5) < 1e-6);
  assert.ok(edge.strength > 0);
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
  for (let frame: number = 0; frame < Math.ceil((TELEGRAPHS.settle * 2) / STEP) + 1; frame += 1) telegraphs.update(STEP, world);
  assert.equal(telegraphs.active, 0);
});
