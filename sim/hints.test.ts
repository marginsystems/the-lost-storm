import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { HintDef, HintsDef } from './content/hints.ts';
import { loadHints } from './content/hints.ts';
import type { Content } from './content/types.ts';
import type { HintChange, HintInput, HintState } from './hints.ts';
import { createHintState, seedVeteran, stepHints } from './hints.ts';
import { startQuests } from './world/quests.ts';
import type { World, WorldEvent } from './world/types.ts';

const content: Content = loadContent();
const defs: HintsDef = loadHints(content);
const IDLE: HintInput = { events: [], open: new Set(), enabled: true };

function fresh(): World {
  const world: World = worldIn(content, content.world.start, 1);
  startQuests(world);
  world.monsters = [];
  return world;
}

function shown(changes: readonly HintChange[]): string | null {
  const change: HintChange | undefined = changes.find((entry: HintChange): boolean => entry.type === 'show');
  return change?.hint.id ?? null;
}

function earlyIds(): string[] {
  return defs.hints.filter((hint: HintDef): boolean => hint.forNewPlayers).map((hint: HintDef): string => hint.id);
}

void test('a fresh game shows the move hint first and removes it once the player has moved', (): void => {
  const world: World = fresh();
  const state: HintState = createHintState([]);
  assert.equal(shown(stepHints(defs, world, state, IDLE)), 'move');
  assert.deepEqual(stepHints(defs, world, state, IDLE), []);
  world.player.pos = { x: world.player.pos.x + 5, z: world.player.pos.z };
  const changes: HintChange[] = stepHints(defs, world, state, IDLE);
  assert.equal(changes[0]?.type, 'hide');
  assert.ok(state.seen.has('move'));
  assert.equal(state.active, null);
});

void test('the next hint is the person to talk to, and talking completes it', (): void => {
  const world: World = fresh();
  const state: HintState = createHintState(['move']);
  assert.equal(shown(stepHints(defs, world, state, IDLE)), 'talk');
  const talked: WorldEvent = { type: 'dialogue_line', npcId: 1, npc: 'x', talk: 't', line: must([...content.lines.values()][0], 'a line'), index: 0, last: true };
  const done: HintChange[] = stepHints(defs, world, state, { ...IDLE, events: [talked] });
  assert.equal(done[0]?.type, 'hide');
});

void test('a hint shows at most once', (): void => {
  const world: World = fresh();
  const state: HintState = createHintState(defs.hints.map((hint: HintDef): string => hint.id));
  assert.deepEqual(stepHints(defs, world, state, IDLE), []);
});

void test('hints wait for the ones they come after', (): void => {
  const world: World = fresh();
  const state: HintState = createHintState(['move', 'talk']);
  world.player.skillPoints = 0;
  const first: string | null = shown(stepHints(defs, world, state, IDLE));
  assert.notEqual(first, 'equip');
  assert.notEqual(first, 'inventory');
});

void test('a skill point shows the tree hint and spending it completes it', (): void => {
  const world: World = fresh();
  const state: HintState = createHintState(earlyIds());
  world.player.skillPoints = 1;
  assert.equal(shown(stepHints(defs, world, state, IDLE)), 'skill_point');
  world.player.skillPoints = 0;
  assert.equal(stepHints(defs, world, state, IDLE)[0]?.type, 'hide');
});

void test('turning hints off hides the active one without marking it seen', (): void => {
  const world: World = fresh();
  const state: HintState = createHintState([]);
  stepHints(defs, world, state, IDLE);
  const off: HintInput = { ...IDLE, enabled: false };
  const changes: HintChange[] = stepHints(defs, world, state, off);
  assert.deepEqual(changes.map((change: HintChange): boolean => change.type === 'hide' && !change.done), [true]);
  assert.equal(state.seen.size, 0);
  assert.deepEqual(stepHints(defs, world, state, off), []);
});

void test('a save that has already played skips the first-minute hints', (): void => {
  const world: World = fresh();
  world.player.level = 4;
  const state: HintState = createHintState([]);
  seedVeteran(defs, state, world);
  world.player.skillPoints = 0;
  assert.equal(shown(stepHints(defs, world, state, IDLE)), null);
  world.player.alive = false;
  assert.equal(shown(stepHints(defs, world, state, IDLE)), 'death');
});

void test('the low life hint needs a carried item of the named slot', (): void => {
  const world: World = fresh();
  const state: HintState = createHintState(earlyIds());
  world.player.life = 1;
  assert.equal(shown(stepHints(defs, world, state, IDLE)), null);
});
