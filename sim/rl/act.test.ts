import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import type { Command } from '../world/types.ts';
import { must } from '../../test/support.ts';
import { actionOf, commandsFor, moveBucket, moveDirection, NO_CARRY } from './act.ts';
import type { Arena } from './arena.ts';
import { arenaObservation, createArena } from './arena.ts';
import { MOVE_CHOICES, NO_ACTION, RL } from './contract.ts';
import type { Observation } from './observe.ts';

const CONTENT: Content = loadContent();

void test('every move direction falls back into its own bucket', (): void => {
  for (let move: number = 1; move < MOVE_CHOICES; move += 1) {
    const direction: Vec2 = must(moveDirection(move), 'direction');
    assert.equal(moveBucket(direction), move);
  }
  assert.equal(moveDirection(0), null);
  assert.equal(moveBucket({ x: 0.01, z: 0 }), 0);
});

void test('doing nothing sends no command', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 21, jitter: 0, waves: 1 });
  const seen: Observation = arenaObservation(arena);
  assert.deepEqual(commandsFor(arena.world, NO_ACTION, seen.view), []);
});

void test('a move walks a few metres that way, and a skill aims at the chosen target', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 22, jitter: 0, waves: 1 });
  const seen: Observation = arenaObservation(arena);
  const from: Vec2 = arena.world.player.pos;
  const walk: Command[] = commandsFor(arena.world, { move: 1, skill: 0, target: 0, flask: 0 }, seen.view);
  assert.deepEqual(walk, [{ type: 'move', held: false, dest: { x: from.x + RL.moveReach, z: from.z } }]);
  const target = must(seen.view.targets[0], 'target');
  const strike: Command[] = commandsFor(arena.world, { move: 0, skill: 1, target: 0, flask: 1 }, seen.view);
  const skill = strike.find((command: Command): boolean => command.type === 'skill');
  assert.ok(skill !== undefined && skill.type === 'skill' && skill.slot === 0 && skill.targetId === target.id);
  assert.ok(strike.some((command: Command): boolean => command.type === 'flask' && command.slot === 0));
});

void test('the bot’s commands read back as the action that would send them', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 23, jitter: 0, waves: 1 });
  const seen: Observation = arenaObservation(arena);
  const from: Vec2 = { x: arena.world.player.pos.x, z: arena.world.player.pos.z };
  const action = { move: 3, skill: 1, target: Math.min(1, seen.view.targets.length - 1), flask: 2 };
  const sent: Command[] = commandsFor(arena.world, action, seen.view);
  assert.deepEqual(actionOf(arena.world, sent, seen.view, from, NO_CARRY), { ...action, move: 0 });
  const both: Command[] = [{ type: 'flask', slot: 0 }, { type: 'flask', slot: 1 }];
  assert.equal(actionOf(arena.world, both, seen.view, from, NO_CARRY).flask, 1);
  const walked: Command[] = commandsFor(arena.world, { move: 6, skill: 0, target: 0, flask: 0 }, seen.view);
  assert.deepEqual(actionOf(arena.world, walked, seen.view, from, NO_CARRY), { move: 6, skill: 0, target: 0, flask: 0 });
});
