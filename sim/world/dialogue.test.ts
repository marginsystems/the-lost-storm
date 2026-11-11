import assert from 'node:assert/strict';
import { test } from 'node:test';
import { finishQuests, must } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, NpcDef, TalkDef } from '../content/types.ts';
import { distance } from '../math.ts';
import { createWorld } from './create.ts';
import { DIALOGUE, hasNews, nextTalk } from './dialogue.ts';
import { stepWorld } from './step.ts';
import type { Command, DialogueState, NpcState, World, WorldEvent } from './types.ts';

const content: Content = loadContent();
const DT: number = 1 / 60;
const LIMIT: number = 30;

type EventOf<T extends WorldEvent['type']> = Extract<WorldEvent, { readonly type: T }>;

function ofType<T extends WorldEvent['type']>(events: readonly WorldEvent[], type: T): EventOf<T>[] {
  return events.filter((event: WorldEvent): event is EventOf<T> => event.type === type);
}

function fresh(seed: number = 1): World {
  return createWorld(content, { seed, save: null });
}

function npcOf(world: World, id: string): NpcState {
  return must(world.npcs.find((npc: NpcState): boolean => npc.def.id === id), `npc ${id}`);
}

function dialogueOf(world: World): DialogueState {
  return must(world.dialogue, 'dialogue');
}

function send(world: World, ...commands: Command[]): WorldEvent[] {
  return stepWorld(world, commands, DT);
}

function talkTo(world: World, id: string): WorldEvent[] {
  const npc: NpcState = npcOf(world, id);
  const events: WorldEvent[] = [];
  const steps: number = Math.round(LIMIT / DT);
  for (let step: number = 0; step < steps; step += 1) {
    const fresher: WorldEvent[] = stepWorld(world, step === 0 ? [{ type: 'talk', npcId: npc.id }] : [], DT);
    events.push(...fresher);
    if (world.dialogue !== null) break;
  }
  return events;
}

function finish(world: World): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let guard: number = 0; guard < 50 && world.dialogue !== null; guard += 1) events.push(...send(world, { type: 'advance' }));
  return events;
}

void test('the town has its people standing where the zone places them, and they are not monsters', (): void => {
  const world: World = fresh();
  assert.deepEqual(world.npcs.map((npc: NpcState): string => npc.def.id).toSorted(), world.zone.npcs.map((placed): string => placed.npc).toSorted());
  assert.equal(world.monsters.length, 0);
  assert.equal(world.dialogue, null);
  assert.deepEqual(world.heard, []);
  const ids: Set<number> = new Set<number>([world.player.id, ...world.npcs.map((npc: NpcState): number => npc.id)]);
  assert.equal(ids.size, world.npcs.length + 1);
});

void test('talk walks the hero up to the npc, opens the first conversation and turns the two to face each other', (): void => {
  const world: World = fresh();
  const maren: NpcState = npcOf(world, 'maren');
  const first: TalkDef = must(maren.def.talks[0], 'first talk');
  assert.ok(distance(world.player.pos, maren.pos) > DIALOGUE.reach);
  assert.equal(hasNews(world, maren.def), true);
  const events: WorldEvent[] = talkTo(world, 'maren');
  assert.ok(distance(world.player.pos, maren.pos) <= DIALOGUE.reach);
  const dialogue = dialogueOf(world);
  assert.equal(dialogue.npcId, maren.id);
  assert.equal(dialogue.talk.id, first.id);
  assert.equal(dialogue.index, 0);
  const lines = ofType(events, 'dialogue_line');
  assert.equal(lines.length, 1);
  const shown = must(lines[0], 'line');
  assert.equal(shown.line.id, first.lines[0]);
  assert.equal(shown.npc, 'maren');
  assert.equal(shown.index, 0);
  assert.equal(shown.last, false);
  assert.equal(shown.line.speaker, 'maren');
  assert.deepEqual(world.player.intent, { type: 'idle' });
  const toHero: number = Math.atan2(world.player.pos.x - maren.pos.x, world.player.pos.z - maren.pos.z);
  assert.ok(Math.abs(maren.facing - toHero) < 1e-6);
  assert.notEqual(maren.facing, maren.homeFacing);
});

void test('advance steps through every line in order, then closes the conversation as finished', (): void => {
  const world: World = fresh();
  const first: TalkDef = must(npcOf(world, 'maren').def.talks[0], 'first talk');
  const shown: string[] = ofType(talkTo(world, 'maren'), 'dialogue_line').map((event): string => event.line.id);
  const rest: WorldEvent[] = finish(world);
  shown.push(...ofType(rest, 'dialogue_line').map((event): string => event.line.id));
  assert.deepEqual(shown, first.lines);
  assert.equal(must(ofType(rest, 'dialogue_line').at(-1), 'last line').last, true);
  assert.deepEqual(ofType(rest, 'dialogue_closed'), [{ type: 'dialogue_closed', npcId: npcOf(world, 'maren').id, npc: 'maren', talk: first.id, finished: true }]);
  assert.equal(world.dialogue, null);
  assert.deepEqual(world.heard, [first.id]);
  assert.equal(npcOf(world, 'maren').facing, npcOf(world, 'maren').homeFacing);
  assert.equal(send(world, { type: 'advance' }).length, 0);
});

void test('a finished once conversation is not offered again; the repeatable one is, every time', (): void => {
  const world: World = fresh();
  const def: NpcDef = npcOf(world, 'maren').def;
  const [first, later] = def.talks;
  talkTo(world, 'maren');
  finish(world);
  assert.equal(hasNews(world, def), false);
  assert.equal(nextTalk(world, def)?.id, must(later, 'later talk').id);
  for (let round: number = 0; round < 2; round += 1) {
    talkTo(world, 'maren');
    assert.equal(dialogueOf(world).talk.id, must(later, 'later talk').id);
    finish(world);
  }
  assert.deepEqual(world.heard, [must(first, 'first talk').id]);
});

void test('walking away half-way closes the conversation without using it up', (): void => {
  const world: World = fresh();
  const first: TalkDef = must(npcOf(world, 'maren').def.talks[0], 'first talk');
  talkTo(world, 'maren');
  send(world, { type: 'advance' });
  assert.equal(dialogueOf(world).index, 1);
  const events: WorldEvent[] = send(world, { type: 'move', held: false, dest: { x: 22, z: 26 } });
  assert.equal(world.dialogue, null);
  assert.deepEqual(ofType(events, 'dialogue_closed').map((event): boolean => event.finished), [false]);
  assert.deepEqual(world.heard, []);
  talkTo(world, 'maren');
  const again = dialogueOf(world);
  assert.equal(again.talk.id, first.id);
  assert.equal(again.index, 0);
});

void test('stop, a skill and talking to someone else each close an open conversation', (): void => {
  const closers: readonly Command[] = [{ type: 'stop' }, { type: 'skill', slot: 0, aim: { x: 22, z: 10 }, targetId: null }];
  for (const closer of closers) {
    const world: World = fresh();
    talkTo(world, 'maren');
    send(world, closer);
    assert.equal(world.dialogue, null, closer.type);
    assert.deepEqual(world.heard, []);
  }
  const world: World = fresh();
  talkTo(world, 'maren');
  const events: WorldEvent[] = talkTo(world, 'hale');
  assert.equal(ofType(events, 'dialogue_closed').length, 1);
  assert.equal(dialogueOf(world).npc.id, 'hale');
});

void test('a skill that cannot be used leaves the conversation open; one that is used closes it', (): void => {
  const world: World = fresh();
  talkTo(world, 'maren');
  world.player.mana = 0;
  const refused: WorldEvent[] = send(world, { type: 'skill', slot: 1, aim: { x: 22, z: 10 }, targetId: null });
  assert.deepEqual(ofType(refused, 'notice').map((event): string => event.reason), ['no_mana']);
  assert.equal(ofType(refused, 'dialogue_closed').length, 0);
  assert.equal(dialogueOf(world).index, 0);
  world.player.mana = world.player.stats.maxMana;
  const used: WorldEvent[] = send(world, { type: 'skill', slot: 1, aim: { x: 22, z: 10 }, targetId: null });
  assert.equal(ofType(used, 'skill_start').length, 1);
  assert.deepEqual(ofType(used, 'dialogue_closed').map((event): boolean => event.finished), [false]);
  assert.equal(world.dialogue, null);
});

void test('inventory and skill-tree commands leave an open conversation alone', (): void => {
  const world: World = fresh();
  talkTo(world, 'maren');
  send(world, { type: 'unequip', slot: 'weapon' }, { type: 'allocate', node: 'tempered_body' });
  assert.notEqual(world.dialogue, null);
});

void test('leaving the zone closes the conversation and the people of the next zone replace the old ones', (): void => {
  const world: World = finishQuests(fresh());
  talkTo(world, 'maren');
  const before: number[] = world.npcs.map((npc: NpcState): number => npc.id);
  const events: WorldEvent[] = [];
  const steps: number = Math.round(LIMIT / DT);
  for (let step: number = 0; step < steps && world.zone.id === content.world.start; step += 1) events.push(...stepWorld(world, step === 0 ? [{ type: 'travel', exit: 'bastion_stair' }] : [], DT));
  assert.equal(world.zone.id, 'drowned_bastion');
  assert.equal(world.dialogue, null);
  assert.deepEqual(ofType(events, 'dialogue_closed').map((event): boolean => event.finished), [false]);
  assert.equal(world.npcs.length, 0);
  for (let step: number = 0; step < steps && world.zone.id !== content.world.start; step += 1) stepWorld(world, step === 0 ? [{ type: 'travel', exit: 'stair' }] : [], DT);
  assert.equal(world.npcs.length, before.length);
  assert.ok(world.npcs.every((npc: NpcState): boolean => !before.includes(npc.id)));
});

void test('talking to an npc that is not here does nothing, and the dead do not talk', (): void => {
  const world: World = fresh();
  send(world, { type: 'talk', npcId: 99999 });
  assert.deepEqual(world.player.intent, { type: 'idle' });
  world.player.alive = false;
  world.player.respawnTimer = 30;
  send(world, { type: 'talk', npcId: npcOf(world, 'maren').id });
  assert.deepEqual(world.player.intent, { type: 'idle' });
  assert.equal(world.dialogue, null);
});
