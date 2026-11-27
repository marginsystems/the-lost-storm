import assert from 'node:assert/strict';
import { test } from 'node:test';
import { faceAt } from '../../test/facing-support.ts';
import { must } from '../../test/support.ts';
import { shapeArena } from '../../test/shape-support.ts';
import { loadContent } from '../content/content.ts';
import type { SkillTrail } from '../content/combat-types.ts';
import type { Content, SkillDef } from '../content/types.ts';
import { distance } from '../math.ts';
import type { Vec2 } from '../math.ts';
import { refreshPlayer } from './character.ts';
import { stepWorld } from './step.ts';
import type { AreaState, World } from './types.ts';

const content: Content = loadContent();
const DT: number = 1 / 60;
const FIREWALL: SkillDef = must(content.skills.get('firewall'), 'firewall');
const TRAIL: SkillTrail = must(FIREWALL.trail ?? undefined, 'firewall trail');

function drawer(): World {
  const world: World = shapeArena([]);
  world.player.learned.push('firewall');
  world.player.bar = ['firewall', null, null, null, null, null];
  refreshPlayer(world);
  world.player.mana = world.player.stats.maxMana;
  faceAt(world.player, at(world, 4, 0));
  return world;
}

function at(world: World, ahead: number, side: number): Vec2 {
  return { x: world.player.pos.x + ahead, z: world.player.pos.z + side };
}

function drag(world: World, path: readonly Vec2[], seconds: number): void {
  const first: Vec2 = must(path[0], 'start');
  stepWorld(world, [{ type: 'hold', slot: 0, down: true }, { type: 'skill', slot: 0, aim: first, targetId: null }], DT);
  const steps: number = Math.round(seconds / DT);
  for (let step: number = 1; step <= steps; step += 1) {
    const share: number = (step / steps) * (path.length - 1);
    const index: number = Math.min(path.length - 2, Math.floor(share));
    const from: Vec2 = must(path[index], 'from');
    const to: Vec2 = must(path[index + 1], 'to');
    const part: number = share - index;
    world.player.mana = world.player.stats.maxMana;
    stepWorld(world, [{ type: 'steer', aim: { x: from.x + (to.x - from.x) * part, z: from.z + (to.z - from.z) * part } }], DT);
  }
}

function wall(world: World): AreaState[] {
  return world.areas.filter((area: AreaState): boolean => area.skill.id === TRAIL.skill && area.ownerId === world.player.id && area.timeLeft > 0);
}

function onSegment(area: AreaState, point: Vec2): boolean {
  const end: Vec2 = { x: area.pos.x + area.toward.x * area.reach, z: area.pos.z + area.toward.z * area.reach };
  return distance(area.pos, point) + distance(point, end) - area.reach < 1e-6;
}

void test('Firewall is held, draws where it aims, and lays a lane that blocks the way', (): void => {
  const segment: SkillDef = must(content.skills.get(TRAIL.skill), TRAIL.skill);
  assert.equal(FIREWALL.press?.type, 'channel');
  assert.equal(TRAIL.from, 'aim');
  assert.ok(segment.delivery.type === 'area' && segment.delivery.length > 0 && segment.delivery.blocks);
});

void test('dragging across the ground lays the wall along the drag, joined end to end', (): void => {
  const world: World = drawer();
  const start: Vec2 = at(world, 4, -3);
  const finish: Vec2 = at(world, 4, 3);
  drag(world, [start, finish], 0.6);
  const laid: AreaState[] = wall(world);
  assert.equal(laid.length, Math.floor(6 / TRAIL.every));
  for (const area of laid) {
    assert.ok(Math.abs(area.pos.x - start.x) < 1e-6, 'each piece lies on the dragged line');
    assert.ok(Math.abs(area.reach - TRAIL.every) < 1e-6);
  }
  for (let index: number = 1; index < laid.length; index += 1) {
    const before: AreaState = must(laid[index - 1], 'before');
    const piece: AreaState = must(laid[index], 'piece');
    assert.ok(onSegment(before, piece.pos), 'each piece starts where the last one ended');
  }
});

void test('holding still draws nothing, and nothing is drawn beyond the reach', (): void => {
  const world: World = drawer();
  drag(world, [at(world, 3, 0), at(world, 3, 0)], 0.5);
  assert.equal(wall(world).length, 0);
  const far: World = drawer();
  drag(far, [at(far, 4, 0), at(far, 40, 0)], 0.8);
  const laid: AreaState[] = wall(far);
  assert.ok(laid.some((area: AreaState): boolean => distance(area.pos, far.player.pos) > 10));
  for (const area of laid) {
    const end: Vec2 = { x: area.pos.x + area.toward.x * area.reach, z: area.pos.z + area.toward.z * area.reach };
    assert.ok(distance(end, far.player.pos) <= TRAIL.range + 1e-6);
  }
});

void test('a rapid zigzag stops the stroke at 17.5 metres and a fresh press cannot replace or extend the live wall', (): void => {
  const world: World = drawer();
  const zigzag: Vec2[] = [at(world, 2, -4), at(world, 4, 4), at(world, 6, -4), at(world, 8, 4), at(world, 9, -4)];
  drag(world, zigzag, 1.5);
  const laid: AreaState[] = wall(world);
  assert.equal(laid.length, TRAIL.limit);
  assert.equal(laid.reduce((sum: number, piece: AreaState): number => sum + piece.reach, 0), 17.5);
  assert.deepEqual(laid[0]?.pos, zigzag[0]);
  assert.equal(world.player.action, null);
  stepWorld(world, [{ type: 'hold', slot: 0, down: false }], DT);
  world.player.mana = world.player.stats.maxMana;
  const refused = stepWorld(world, [{ type: 'skill', slot: 0, aim: at(world, 4, 0), targetId: null }], DT);
  assert.ok(refused.some((event): boolean => event.type === 'notice' && event.reason === 'wall_full'));
  assert.equal(world.player.mana, world.player.stats.maxMana);
  drag(world, zigzag.toReversed(), 0.7);
  assert.deepEqual(wall(world).map((piece: AreaState): number => piece.id), laid.map((piece: AreaState): number => piece.id));
  for (let step: number = 0; step < 300; step += 1) stepWorld(world, [], DT);
  assert.equal(wall(world).length, 0);
  stepWorld(world, [{ type: 'hold', slot: 0, down: false }], DT);
  drag(world, zigzag, 1.2);
  assert.equal(wall(world).length, TRAIL.limit);
});

void test('separate partial strokes can spend only the space left by the first wall', (): void => {
  const world: World = drawer();
  drag(world, [at(world, 3, -3), at(world, 3, 3)], 0.5);
  const first: AreaState[] = wall(world);
  assert.ok(first.length > 0 && first.length < TRAIL.limit);
  stepWorld(world, [{ type: 'hold', slot: 0, down: false }], DT);
  for (let step: number = 0; step < 20; step += 1) stepWorld(world, [], DT);
  drag(world, [at(world, 5, -5), at(world, 5, 5), at(world, 6, -5)], 0.9);
  const both: AreaState[] = wall(world);
  assert.equal(both.reduce((sum: number, piece: AreaState): number => sum + piece.reach, 0), 17.5);
  assert.deepEqual(both.slice(0, first.length), first);
  assert.equal(world.player.action, null);
});

void test('one slow stroke ends after 17.5 metres even when its first pieces have already expired', (): void => {
  const world: World = drawer();
  const aim: Vec2 = at(world, 4, -4);
  const seen: Set<number> = new Set<number>();
  stepWorld(world, [{ type: 'hold', slot: 0, down: true }, { type: 'skill', slot: 0, aim, targetId: null }], DT);
  for (let step: number = 0; step < 720; step += 1) {
    world.player.mana = world.player.stats.maxMana;
    const forward: number = step % 480;
    stepWorld(world, [{ type: 'steer', aim: at(world, 4, -4 + Math.min(forward, 480 - forward) / 30) }], DT);
    for (const area of wall(world)) seen.add(area.id);
  }
  assert.equal(seen.size * TRAIL.every, 17.5);
  assert.equal(world.player.action, null);
});
