import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { stepWorld } from '../world/step.ts';
import type { Command } from '../world/types.ts';
import { must } from '../../test/support.ts';
import { actionOf, carriedOrder, commandsFor, moveBucket } from './act.ts';
import type { Arena } from './arena.ts';
import { arenaObservation, createArena } from './arena.ts';
import { NO_ACTION, RL } from './contract.ts';
import type { Observation } from './observe.ts';

const CONTENT: Content = loadContent();

void test('a still action stops a hero who is still walking', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 41, jitter: 0, waves: 1 });
  const world = arena.world;
  for (const command of commandsFor(world, { move: 1, skill: 0, target: 0, flask: 0 }, arenaObservation(arena).view)) stepWorld(world, [command], RL.tick);
  assert.equal(world.player.intent.type, 'move');
  const still: Command[] = commandsFor(world, NO_ACTION, arenaObservation(arena).view);
  assert.deepEqual(still, [{ type: 'stop' }]);
  stepWorld(world, still, RL.tick);
  assert.equal(world.player.intent.type, 'idle');
  const at: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  stepWorld(world, commandsFor(world, NO_ACTION, arenaObservation(arena).view), RL.tick);
  assert.ok(Math.hypot(world.player.pos.x - at.x, world.player.pos.z - at.z) < 1e-6);
});

void test('the bot carrying on an earlier walk or attack is labelled as that walk or attack', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 42, jitter: 0, waves: 1 });
  const world = arena.world;
  const seen: Observation = arenaObservation(arena);
  const from: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  world.player.intent = { type: 'move', dest: { x: from.x, z: from.z + RL.moveReach } };
  assert.deepEqual(actionOf(world, [], seen.view, from, carriedOrder(world, seen.view, from)), { move: moveBucket({ x: 0, z: RL.moveReach }), skill: 0, target: 0, flask: 0 });
  const target = must(seen.view.targets[0], 'target');
  world.player.intent = { type: 'attack', slot: 0, targetId: target.id };
  assert.deepEqual(actionOf(world, [], seen.view, from, carriedOrder(world, seen.view, from)), { move: 0, skill: 1, target: 0, flask: 0 });
  world.player.intent = { type: 'idle' };
  assert.deepEqual(actionOf(world, [], seen.view, from, carriedOrder(world, seen.view, from)), NO_ACTION);
});

void test('a drink alone does not stop a walk', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 43, jitter: 0, waves: 1 });
  const world = arena.world;
  stepWorld(world, commandsFor(world, { move: 3, skill: 0, target: 0, flask: 0 }, arenaObservation(arena).view), RL.tick);
  assert.equal(world.player.intent.type, 'move');
  const drink: Command[] = commandsFor(world, { move: 0, skill: 0, target: 0, flask: 1 }, arenaObservation(arena).view);
  assert.deepEqual(drink, [{ type: 'flask', slot: 0 }]);
});

void test('an attack on a monster outside the view is labelled at the nearest monster in view, even if it dies before the label is read', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 44, jitter: 0, waves: 3 });
  const world = arena.world;
  const seen: Observation = arenaObservation(arena);
  assert.ok(seen.view.targets.length >= 2);
  const far = must(seen.view.targets[0], 'far');
  const narrowed = { ...seen.view, targets: seen.view.targets.slice(1) };
  const gaps: number[] = narrowed.targets.map((monster): number => Math.hypot(monster.pos.x - far.pos.x, monster.pos.z - far.pos.z));
  const nearest: number = gaps.indexOf(Math.min(...gaps));
  const from: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  world.player.intent = { type: 'attack', slot: 0, targetId: far.id };
  const carried = carriedOrder(world, narrowed, from);
  far.alive = false;
  assert.deepEqual(actionOf(world, [], narrowed, from, carried), { move: 0, skill: 1, target: nearest, flask: 0 });
});
