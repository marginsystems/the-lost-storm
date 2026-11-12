import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { generateItem } from '../items.ts';
import type { Vec2 } from '../math.ts';
import { createRng } from '../rng.ts';
import { distance } from '../math.ts';
import { createWorld } from './create.ts';
import { aimedItem } from './finds.ts';
import { shoreDepth } from './shore.ts';
import { stepWorld } from './step.ts';
import { wakeLength } from './wake.ts';
import type { Command, GroundItem, World } from './types.ts';

const content: Content = loadContent();
const DT: number = 1 / 60;
const LIMIT: number = 90;

function risen(seed: number): World {
  const world: World = createWorld(content, { seed, save: null, opening: true });
  const wake = must(world.wake, 'wake');
  for (let step: number = 0; step < Math.ceil(wakeLength(wake.plan) / DT) + 1; step += 1) stepWorld(world, [], DT);
  return world;
}

function findOf(world: World, id: string): GroundItem | null {
  return world.ground.find((ground: GroundItem): boolean => ground.find === id) ?? null;
}

function walk(world: World, dir: Vec2): Command {
  return { type: 'move', held: true, dest: { x: world.player.pos.x + dir.x * 6, z: world.player.pos.z + dir.z * 6 } };
}

function walkUntil(world: World, dir: Vec2, done: () => boolean): void {
  for (let seconds: number = 0; !done() && seconds < LIMIT; seconds += DT) stepWorld(world, [walk(world, dir)], DT);
}

function stepUntil(world: World, command: () => readonly Command[], done: () => boolean): void {
  for (let seconds: number = 0; !done() && seconds < LIMIT; seconds += DT) stepWorld(world, command(), DT);
}

function carries(world: World, base: string): boolean {
  return world.player.inventory.some((item): boolean => item?.base === base) || Object.values(world.player.equipped).some((item): boolean => item?.base === base);
}

void test('a new hero wakes in the mist with nothing in his hands', (): void => {
  const world: World = createWorld(content, { seed: 1, save: null, opening: true });
  assert.equal(world.player.equipped.weapon, null);
  assert.equal(carries(world, 'rusted_blade'), false);
});

void test('a held walk straight across the journal never picks it up, nor does stopping on it', (): void => {
  const world: World = risen(2);
  walkUntil(world, world.heading, (): boolean => findOf(world, 'journal') !== null);
  const journal: GroundItem = must(findOf(world, 'journal'), 'journal');
  const beyond: Vec2 = { x: journal.pos.x + (journal.pos.x - world.player.pos.x), z: journal.pos.z + (journal.pos.z - world.player.pos.z) };
  stepUntil(world, (): readonly Command[] => [{ type: 'move', held: true, dest: beyond }], (): boolean => distance(world.player.pos, beyond) < 1);
  stepUntil(world, (): readonly Command[] => [{ type: 'move', held: true, dest: journal.pos }], (): boolean => distance(world.player.pos, journal.pos) < 0.2);
  for (let step: number = 0; step < 60; step += 1) stepWorld(world, [], DT);
  assert.equal(carries(world, 'worn_journal'), false);
  assert.notEqual(findOf(world, 'journal'), null);
});

void test('a click on the ground past the journal\'s reach is only a walk there', (): void => {
  const world: World = risen(5);
  walkUntil(world, world.heading, (): boolean => findOf(world, 'journal') !== null);
  const journal: GroundItem = must(findOf(world, 'journal'), 'journal');
  const past: Vec2 = { x: journal.pos.x + content.player.pickupAim + 1.2, z: journal.pos.z };
  assert.equal(aimedItem(world, past), null);
  stepWorld(world, [{ type: 'move', held: false, dest: past }], DT);
  for (let step: number = 0; step < 600; step += 1) stepWorld(world, [], DT);
  assert.equal(carries(world, 'worn_journal'), false);
});

void test('a click on the journal or anywhere within its reach aims at it, and the pickup it sends walks over and takes it, even mid-walk', (): void => {
  const world: World = risen(3);
  walkUntil(world, world.heading, (): boolean => findOf(world, 'journal') !== null);
  const journal: GroundItem = must(findOf(world, 'journal'), 'journal');
  const reach: number = content.player.pickupAim;
  assert.equal(aimedItem(world, journal.pos)?.id, journal.id);
  assert.equal(aimedItem(world, { x: journal.pos.x + reach * 0.9, z: journal.pos.z })?.id, journal.id);
  assert.equal(aimedItem(world, { x: journal.pos.x + reach * 1.1, z: journal.pos.z }), null);
  stepWorld(world, [walk(world, { x: -world.heading.x, z: -world.heading.z })], DT);
  stepWorld(world, [{ type: 'pickup', groundId: journal.id }], DT);
  stepUntil(world, (): readonly Command[] => [], (): boolean => carries(world, 'worn_journal'));
  assert.ok(carries(world, 'worn_journal'));
});

void test('out on the black shore lies the first blade, and picking it up puts it in his hand', (): void => {
  const world: World = risen(4);
  world.flags['opening'] = 'read';
  const east: Vec2 = { x: world.heading.x, z: world.heading.z };
  walkUntil(world, east, (): boolean => findOf(world, 'blade') !== null);
  assert.ok(shoreDepth(world) >= 0.3);
  const blade: GroundItem = must(findOf(world, 'blade'), 'blade');
  stepUntil(world, (): readonly Command[] => [{ type: 'move', held: true, dest: blade.pos }], (): boolean => distance(world.player.pos, blade.pos) < 0.5);
  assert.equal(carries(world, 'rusted_blade'), false);
  stepWorld(world, [{ type: 'pickup', groundId: blade.id }], DT);
  stepUntil(world, (): readonly Command[] => [], (): boolean => world.player.equipped.weapon !== null);
  assert.equal(world.player.equipped.weapon?.base, 'rusted_blade');
  assert.equal(world.flags['first_blade'], 'found');
});

void test('standing on a find with a full pack leaves it there without a notice every step', (): void => {
  const world: World = risen(7);
  walkUntil(world, world.heading, (): boolean => findOf(world, 'journal') !== null);
  const journal: GroundItem = must(findOf(world, 'journal'), 'journal');
  const filler = must(generateItem(content, createRng(7), 901, 1, 'rusted_blade', 'common'), 'filler');
  world.player.inventory.fill(filler);
  world.player.pos = { x: journal.pos.x, z: journal.pos.z };
  let notices: number = 0;
  for (let step: number = 0; step < 30; step += 1) notices += stepWorld(world, [], DT).filter((event): boolean => event.type === 'notice').length;
  assert.equal(notices, 0);
  assert.notEqual(findOf(world, 'journal'), null);
});
