import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../test/support.ts';
import { TOWN_CONTENT } from '../test/town-support.ts';
import { stepWorld } from './world/step.ts';
import { loadContent } from './content/content.ts';
import type { HintDef, HintsDef } from './content/hints.ts';
import { loadHints } from './content/hints.ts';
import type { Content, QuestDef } from './content/types.ts';
import type { HintChange, HintInput, HintState } from './hints.ts';
import { createHintState, HINTS, seedVeteran, stepHints } from './hints.ts';
import { startQuests } from './world/quests.ts';
import type { ItemInstance, MomentState, World, WorldEvent } from './world/types.ts';
import { forceStrike } from './world/moments.ts';

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
  const errand: QuestDef = { id: 'errand', name: 'An Errand', requires: [], when: [], objectives: [{ id: 'ask', type: 'talk', npc: 'keeper', text: 'Ask', when: [], sets: {} }] };
  const world: World = worldIn({ ...TOWN_CONTENT, quests: new Map<string, QuestDef>([[errand.id, errand]]) }, 'hub', 1);
  startQuests(world);
  world.monsters = [];
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
});

void test('a save that has finished a quest skips the first-minute hints even at level one', (): void => {
  const world: World = fresh();
  world.quests = { out_of_the_mist: 1 };
  const state: HintState = createHintState([]);
  seedVeteran(defs, state, world);
  assert.ok(defs.hints.filter((hint): boolean => hint.forNewPlayers).every((hint): boolean => state.seen.has(hint.id)));
});

void test('the low life hint needs a carried item of the named slot', (): void => {
  const world: World = fresh();
  const state: HintState = createHintState(earlyIds());
  world.player.life = 1;
  assert.equal(shown(stepHints(defs, world, state, IDLE)), null);
});

function placeInBag(world: World, base: string): void {
  const free: number = world.player.inventory.indexOf(null);
  world.player.inventory[free] = { uid: 900 + free, base, rarity: 'common', level: 1, affixes: [], ledger: null };
}

function allBut(...ids: string[]): string[] {
  return defs.hints.map((hint: HintDef): string => hint.id).filter((id: string): boolean => !ids.includes(id));
}

void test('the equip hint waits until the bag holds something to wear', (): void => {
  const world: World = fresh();
  world.player.skillPoints = 0;
  world.player.inventory.fill(null);
  const state: HintState = createHintState(allBut('equip'));
  placeInBag(world, 'worn_journal');
  assert.equal(shown(stepHints(defs, world, state, IDLE)), null);
  placeInBag(world, 'rusted_blade');
  assert.equal(shown(stepHints(defs, world, state, IDLE)), 'equip');
});

void test('dying puts the active hint aside and keeps it for later', (): void => {
  const world: World = fresh();
  world.player.skillPoints = 0;
  world.player.inventory.fill(null);
  placeInBag(world, 'rusted_blade');
  const state: HintState = createHintState(allBut('equip'));
  assert.equal(shown(stepHints(defs, world, state, IDLE)), 'equip');
  world.player.alive = false;
  const aside: HintChange[] = stepHints(defs, world, state, IDLE);
  assert.deepEqual(aside.map((change: HintChange): string => change.type), ['hide']);
  assert.equal(state.seen.has('equip'), false);
  assert.equal(shown(stepHints(defs, world, state, IDLE)), null);
  world.player.alive = true;
  assert.equal(shown(stepHints(defs, world, state, IDLE)), 'equip');
});

void test('swapping the worn weapon for one from the bag completes the equip hint', (): void => {
  const world: World = fresh();
  world.player.skillPoints = 0;
  world.player.inventory.fill(null);
  assert.notEqual(world.player.equipped.weapon, null);
  placeInBag(world, 'rusted_blade');
  const state: HintState = createHintState(allBut('equip'));
  assert.equal(shown(stepHints(defs, world, state, IDLE)), 'equip');
  stepWorld(world, [{ type: 'equip', inventoryIndex: world.player.inventory.findIndex((item: ItemInstance | null): boolean => item !== null) }], 0.05);
  const done: HintChange[] = stepHints(defs, world, state, IDLE);
  assert.deepEqual(done.map((change: HintChange): string => change.type), ['hide']);
  assert.ok(state.seen.has('equip'));
});

void test('the inventory hint waits for something to wear, not for any pickup', (): void => {
  const world: World = fresh();
  world.player.skillPoints = 0;
  world.player.inventory.fill(null);
  const state: HintState = createHintState(allBut('inventory', 'equip'));
  placeInBag(world, 'worn_journal');
  assert.equal(shown(stepHints(defs, world, state, IDLE)), null);
  placeInBag(world, 'rusted_blade');
  assert.equal(shown(stepHints(defs, world, state, IDLE)), 'inventory');
});

void test('a hint the player leaves alone steps aside after a short while and does not come back', (): void => {
  const world: World = fresh();
  const state: HintState = createHintState([]);
  assert.equal(shown(stepHints(defs, world, state, IDLE)), 'move');
  world.time += HINTS.maxShowSeconds;
  const aside: HintChange[] = stepHints(defs, world, state, IDLE);
  assert.deepEqual(aside.map((change: HintChange): boolean => change.type === 'hide' && change.done), [true]);
  assert.ok(state.seen.has('move'));
  assert.notEqual(shown(stepHints(defs, world, state, IDLE)), 'move');
});

void test('time spent in a conversation does not count toward a hint stepping aside', (): void => {
  const world: World = fresh();
  const state: HintState = createHintState([]);
  assert.equal(shown(stepHints(defs, world, state, IDLE)), 'move');
  const npc = must(content.npcs.values().next().value, 'an npc');
  world.dialogue = { npcId: 0, npc, talk: must(npc.talks[0], 'a talk'), index: 0 };
  world.time += HINTS.maxShowSeconds * 2;
  assert.deepEqual(stepHints(defs, world, state, IDLE), []);
  world.dialogue = null;
  world.time += HINTS.maxShowSeconds / 2;
  assert.deepEqual(stepHints(defs, world, state, IDLE), []);
  assert.equal(state.active, 'move');
});

void test('the first time the hero stands in an awake moment a quiet line says leaving ends it, and it goes when the moment is over', (): void => {
  const world: World = fresh();
  const state: HintState = createHintState(defs.hints.filter((hint: HintDef): boolean => hint.id !== 'moment_edge').map((hint: HintDef): string => hint.id));
  const moment: MomentState = must(forceStrike(world, { ...world.player.pos }, 'campfire'), 'a moment');
  assert.notEqual(shown(stepHints(defs, world, state, IDLE)), 'moment_edge');
  moment.phase = 'awake';
  assert.equal(shown(stepHints(defs, world, state, IDLE)), 'moment_edge');
  moment.phase = 'fading';
  const changes: HintChange[] = stepHints(defs, world, state, IDLE);
  assert.ok(changes.some((change: HintChange): boolean => change.type === 'hide' && change.done));
  moment.phase = 'awake';
  assert.notEqual(shown(stepHints(defs, world, state, IDLE)), 'moment_edge');
});
