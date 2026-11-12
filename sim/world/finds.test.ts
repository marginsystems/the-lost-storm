import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { createWorld } from './create.ts';
import { shoreDepth } from './shore.ts';
import { stepWorld } from './step.ts';
import type { Command, GroundItem, World } from './types.ts';

const content: Content = loadContent();
const DT: number = 1 / 60;
const LIMIT: number = 90;

function risen(seed: number): World {
  const world: World = createWorld(content, { seed, save: null, opening: true });
  const wake = must(world.wake, 'wake');
  for (let step: number = 0; step < Math.ceil((wake.lie + wake.rise) / DT) + 1; step += 1) stepWorld(world, [], DT);
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

void test('walking onto the journal picks it up, with no click on its label', (): void => {
  const world: World = risen(2);
  walkUntil(world, world.heading, (): boolean => findOf(world, 'journal') !== null);
  const journal: GroundItem = must(findOf(world, 'journal'), 'journal');
  stepUntil(world, (): readonly Command[] => [{ type: 'move', held: true, dest: journal.pos }], (): boolean => carries(world, 'worn_journal'));
  assert.ok(carries(world, 'worn_journal'));
});

void test('a click near the journal, not on it, walks over and picks it up', (): void => {
  const world: World = risen(3);
  walkUntil(world, world.heading, (): boolean => findOf(world, 'journal') !== null);
  const journal: GroundItem = must(findOf(world, 'journal'), 'journal');
  const rules = must(world.zone.void, 'void');
  const near: Vec2 = { x: journal.pos.x + rules.finds.aim * 0.8, z: journal.pos.z };
  stepWorld(world, [{ type: 'move', held: false, dest: near }], DT);
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
  stepUntil(world, (): readonly Command[] => [{ type: 'move', held: true, dest: blade.pos }], (): boolean => world.player.equipped.weapon !== null);
  assert.equal(world.player.equipped.weapon?.base, 'rusted_blade');
  assert.equal(world.flags['first_blade'], 'found');
});
