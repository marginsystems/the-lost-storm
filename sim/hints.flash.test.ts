import assert from 'node:assert/strict';
import { test } from 'node:test';
import { worldIn } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { HintsDef } from './content/hints.ts';
import { loadHints } from './content/hints.ts';
import type { Content } from './content/types.ts';
import type { HintChange, HintInput, HintState } from './hints.ts';
import { createHintState, HINTS, stepHints } from './hints.ts';
import { startQuests } from './world/quests.ts';
import type { World } from './world/types.ts';

const content: Content = loadContent();
const defs: HintsDef = loadHints(content);
const IDLE: HintInput = { events: [], open: new Set(), enabled: true };

function fresh(zone: string): World {
  const world: World = worldIn(content, zone, 30);
  startQuests(world);
  world.monsters = [];
  return world;
}

void test('in a flash no hint starts, and one already showing neither runs out, completes nor is remembered as seen', (): void => {
  const outside: World = fresh(content.world.start);
  const state: HintState = createHintState([]);
  const started: HintChange[] = stepHints(defs, outside, state, IDLE);
  const active: string | null = state.active;
  assert.notEqual(active, null);
  assert.ok(started.some((change: HintChange): boolean => change.type === 'show'));
  const flash: World = fresh('next_moment');
  flash.time = outside.time;
  flash.player.pos = { ...outside.player.pos };
  stepHints(defs, flash, state, IDLE);
  flash.time += HINTS.maxShowSeconds * 2;
  assert.deepEqual(stepHints(defs, flash, state, IDLE), []);
  flash.player.pos = { x: outside.player.pos.x + 10, z: outside.player.pos.z + 10 };
  assert.deepEqual(stepHints(defs, flash, state, IDLE), []);
  assert.equal(state.active, active);
  assert.equal(state.seen.size, 0);

  const quiet: HintState = createHintState([]);
  assert.deepEqual(stepHints(defs, fresh('next_moment'), quiet, IDLE), []);
  assert.equal(quiet.active, null);
});
