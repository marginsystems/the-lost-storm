import assert from 'node:assert/strict';
import { test } from 'node:test';
import { armed, finishQuests, must, withoutGlitches, worldIn } from '../../test/support.ts';
import { TOWN_CONTENT } from '../../test/town-support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, NpcDef, QuestDef, TalkDef } from '../content/types.ts';
import { distance } from '../math.ts';
import { toSave } from '../save.ts';
import type { SaveData } from '../save.ts';
import { allHold } from './conditions.ts';
import { createWorld } from './create.ts';
import { canReplay, DIALOGUE, hasNews, nextTalk, replayable } from './dialogue.ts';
import { activeQuests, currentObjective } from './quests.ts';
import { stepWorld } from './step.ts';
import type { Command, DialogueState, NpcState, World, WorldEvent } from './types.ts';

const content: Content = TOWN_CONTENT;
const SHIPPED: Content = loadContent();
const DT: number = 1 / 60;
const LIMIT: number = 30;

type EventOf<T extends WorldEvent['type']> = Extract<WorldEvent, { readonly type: T }>;

function ofType<T extends WorldEvent['type']>(events: readonly WorldEvent[], type: T): EventOf<T>[] {
  return events.filter((event: WorldEvent): event is EventOf<T> => event.type === type);
}

function fresh(seed: number = 1): World {
  return armed(createWorld(content, { seed, save: null }));
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
  const standing: string[] = world.npcs.map((npc: NpcState): string => `${npc.def.id} ${npc.pos.x},${npc.pos.z}`).toSorted();
  assert.deepEqual(standing, world.zone.npcs.filter((placed): boolean => allHold(world, placed.when)).map((placed): string => `${placed.npc} ${placed.x},${placed.z}`).toSorted());
  assert.equal(new Set<string>(world.npcs.map((npc: NpcState): string => npc.def.id)).size, world.npcs.length);
  assert.equal(world.monsters.length, 0);
  assert.equal(world.dialogue, null);
  assert.deepEqual(world.heard, []);
  const ids: Set<number> = new Set<number>([world.player.id, ...world.npcs.map((npc: NpcState): number => npc.id)]);
  assert.equal(ids.size, world.npcs.length + 1);
});

void test('talk walks the hero up to the npc, opens the first conversation and turns the two to face each other', (): void => {
  const world: World = fresh();
  const keeper: NpcState = npcOf(world, 'keeper');
  const first: TalkDef = must(keeper.def.talks[0], 'first talk');
  assert.ok(distance(world.player.pos, keeper.pos) > DIALOGUE.reach);
  assert.equal(hasNews(world, keeper.def), true);
  const events: WorldEvent[] = talkTo(world, 'keeper');
  assert.ok(distance(world.player.pos, keeper.pos) <= DIALOGUE.reach);
  const dialogue = dialogueOf(world);
  assert.equal(dialogue.npcId, keeper.id);
  assert.equal(dialogue.talk.id, first.id);
  assert.equal(dialogue.index, 0);
  const lines = ofType(events, 'dialogue_line');
  assert.equal(lines.length, 1);
  const shown = must(lines[0], 'line');
  assert.equal(shown.line.id, first.lines[0]);
  assert.equal(shown.npc, 'keeper');
  assert.equal(shown.index, 0);
  assert.equal(shown.last, false);
  assert.equal(shown.line.speaker, 'keeper');
  assert.deepEqual(world.player.intent, { type: 'idle' });
  const toHero: number = Math.atan2(world.player.pos.x - keeper.pos.x, world.player.pos.z - keeper.pos.z);
  assert.ok(Math.abs(keeper.facing - toHero) < 1e-6);
  assert.notEqual(keeper.facing, keeper.homeFacing);
});

void test('advance steps through every line in order, then closes the conversation as finished', (): void => {
  const world: World = fresh();
  const first: TalkDef = must(npcOf(world, 'keeper').def.talks[0], 'first talk');
  const shown: string[] = ofType(talkTo(world, 'keeper'), 'dialogue_line').map((event): string => event.line.id);
  const rest: WorldEvent[] = finish(world);
  shown.push(...ofType(rest, 'dialogue_line').map((event): string => event.line.id));
  assert.deepEqual(shown, first.lines);
  assert.equal(must(ofType(rest, 'dialogue_line').at(-1), 'last line').last, true);
  assert.deepEqual(ofType(rest, 'dialogue_closed'), [{ type: 'dialogue_closed', npcId: npcOf(world, 'keeper').id, npc: 'keeper', talk: first.id, finished: true, replay: false }]);
  assert.equal(world.dialogue, null);
  assert.deepEqual(world.heard, [first.id]);
  assert.equal(npcOf(world, 'keeper').facing, npcOf(world, 'keeper').homeFacing);
  assert.equal(send(world, { type: 'advance' }).length, 0);
});

void test('a finished once conversation is not offered again; the repeatable one is, every time', (): void => {
  const world: World = fresh();
  const def: NpcDef = npcOf(world, 'keeper').def;
  const first: TalkDef = must(def.talks[0], 'first talk');
  const later: TalkDef = must(def.talks.find((talk: TalkDef): boolean => !talk.once && talk.when.length === 0), 'repeatable talk');
  talkTo(world, 'keeper');
  finish(world);
  assert.equal(hasNews(world, def), false);
  assert.equal(nextTalk(world, def)?.id, later.id);
  for (let round: number = 0; round < 2; round += 1) {
    talkTo(world, 'keeper');
    assert.equal(dialogueOf(world).talk.id, later.id);
    finish(world);
  }
  assert.deepEqual(world.heard, [first.id]);
});

void test('walking away half-way closes the conversation without using it up', (): void => {
  const world: World = fresh();
  const first: TalkDef = must(npcOf(world, 'keeper').def.talks[0], 'first talk');
  talkTo(world, 'keeper');
  send(world, { type: 'advance' });
  assert.equal(dialogueOf(world).index, 1);
  const events: WorldEvent[] = send(world, { type: 'move', held: false, dest: { x: 6, z: 20 } });
  assert.equal(world.dialogue, null);
  assert.deepEqual(ofType(events, 'dialogue_closed').map((event): boolean => event.finished), [false]);
  assert.deepEqual(world.heard, []);
  talkTo(world, 'keeper');
  const again = dialogueOf(world);
  assert.equal(again.talk.id, first.id);
  assert.equal(again.index, 0);
});

void test('stop, a skill and talking to someone else each close an open conversation', (): void => {
  const closers: readonly Command[] = [{ type: 'stop' }, { type: 'skill', slot: 0, aim: { x: 22, z: 10 }, targetId: null }];
  for (const closer of closers) {
    const world: World = fresh();
    talkTo(world, 'keeper');
    send(world, closer);
    assert.equal(world.dialogue, null, closer.type);
    assert.deepEqual(world.heard, []);
  }
  const world: World = fresh();
  talkTo(world, 'keeper');
  const events: WorldEvent[] = talkTo(world, 'courier');
  assert.equal(ofType(events, 'dialogue_closed').length, 1);
  assert.equal(dialogueOf(world).npc.id, 'courier');
});

void test('a skill that cannot be used leaves the conversation open; one that is used closes it', (): void => {
  const world: World = fresh();
  talkTo(world, 'keeper');
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
  talkTo(world, 'keeper');
  send(world, { type: 'unequip', slot: 'weapon' }, { type: 'allocate', node: 'tempered_body' });
  assert.notEqual(world.dialogue, null);
});

void test('leaving the zone closes the conversation and the people of the next zone replace the old ones', (): void => {
  const world: World = withoutGlitches(finishQuests(fresh()));
  talkTo(world, 'keeper');
  const before: number[] = world.npcs.map((npc: NpcState): number => npc.id);
  const events: WorldEvent[] = [];
  const steps: number = Math.round(LIMIT / DT);
  for (let step: number = 0; step < steps && world.zone.id === content.world.start; step += 1) events.push(...stepWorld(world, step === 0 ? [{ type: 'travel', exit: 'outpost_stair' }] : [], DT));
  assert.equal(world.zone.id, 'outpost');
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
  send(world, { type: 'talk', npcId: npcOf(world, 'keeper').id });
  assert.deepEqual(world.player.intent, { type: 'idle' });
  assert.equal(world.dialogue, null);
});

function atTheFire(shipped: Content = SHIPPED): World {
  const world: World = withoutGlitches(worldIn(shipped, 'hideout', 3));
  for (const quest of shipped.quests.values()) world.quests[quest.id] = quest.objectives.length;
  world.quests = Object.fromEntries(Object.entries(world.quests).filter(([id]: [string, number]): boolean => id !== 'the_gate'));
  world.quests['wardens_lesson'] = 0;
  world.events = [];
  return world;
}

function heardFrom(world: World, id: string): string[] {
  const shown: string[] = ofType(talkTo(world, id), 'dialogue_line').map((event): string => event.line.id);
  shown.push(...ofType(finish(world), 'dialogue_line').map((event): string => event.line.id));
  return shown;
}

void test('at the fire the Guide follows his lesson with the gap, then names the Reckoner and leaves the Gate on the tracker, and says one last thing once it falls', (): void => {
  const world: World = atTheFire();
  const guide: NpcDef = npcOf(world, 'warden_guide').def;
  assert.deepEqual(heardFrom(world, 'warden_guide'), ['warden_guide_lesson']);
  assert.equal(world.flags['fire_lesson'], 'given');
  assert.equal(hasNews(world, guide), true);
  assert.deepEqual(heardFrom(world, 'warden_guide'), ['warden_guide_born', 'warden_guide_far_apart', 'warden_guide_gap', 'warden_guide_counting', 'warden_guide_no_one', 'warden_guide_ledger']);
  assert.equal(hasNews(world, guide), true);
  assert.deepEqual(heardFrom(world, 'warden_guide'), ['warden_guide_reckoner', 'warden_guide_stronger']);
  const gate: QuestDef = must(SHIPPED.quests.get('the_gate'), 'the Gate quest');
  assert.ok(activeQuests(world).includes(gate));
  assert.equal(currentObjective(world, gate)?.type, 'defeat');
  assert.equal(hasNews(world, guide), false);
  assert.deepEqual(heardFrom(world, 'warden_guide'), ['warden_guide_road']);
  world.flags['keeper_defeated'] = 'yes';
  assert.equal(hasNews(world, guide), true);
  assert.deepEqual(heardFrom(world, 'warden_guide'), ['warden_guide_short']);
  assert.deepEqual(heardFrom(world, 'warden_guide'), ['warden_guide_road']);
});

void test('a hero who beat the Reckoner before the fire talks existed hears the gap and then the last word, never the warning', (): void => {
  const world: World = atTheFire();
  world.quests['wardens_lesson'] = 1;
  world.flags['fire_lesson'] = 'given';
  world.flags['keeper_defeated'] = 'yes';
  assert.deepEqual(heardFrom(world, 'warden_guide'), ['warden_guide_born', 'warden_guide_far_apart', 'warden_guide_gap', 'warden_guide_counting', 'warden_guide_no_one', 'warden_guide_ledger']);
  assert.deepEqual(heardFrom(world, 'warden_guide'), ['warden_guide_short']);
  assert.deepEqual(heardFrom(world, 'warden_guide'), ['warden_guide_road']);
});

void test('before his lesson the Guide has none of the fire talks to give', (): void => {
  const world: World = atTheFire();
  world.quests = Object.fromEntries(Object.entries(world.quests).filter(([id]: [string, number]): boolean => id !== 'wardens_lesson'));
  assert.equal(nextTalk(world, npcOf(world, 'warden_guide').def)?.id, 'warden_guide_talk');
});

const FIRE = {
  between: ['warden_guide_born', 'warden_guide_far_apart', 'warden_guide_gap', 'warden_guide_counting', 'warden_guide_no_one', 'warden_guide_ledger'],
  gate: ['warden_guide_reckoner', 'warden_guide_stronger'],
} as const;

function offered(world: World): string[] {
  return replayable(world, npcOf(world, 'warden_guide').def).map((talk: TalkDef): string => talk.id);
}

function atTheGate(shipped: Content = SHIPPED): World {
  const world: World = atTheFire(shipped);
  for (let talk: number = 0; talk < 3; talk += 1) heardFrom(world, 'warden_guide');
  return world;
}

function settled(world: World): string {
  const save: SaveData = toSave(world);
  return JSON.stringify({ save: { ...save, tally: { ...save.tally, played: 0 } }, quests: world.quests, flags: world.flags, heard: world.heard });
}

void test('at each step the Guide offers again only the talks the hero has heard whose conditions still hold, never a later one', (): void => {
  const world: World = atTheFire();
  assert.deepEqual(offered(world), []);
  heardFrom(world, 'warden_guide');
  assert.deepEqual(offered(world), [], 'the lesson belongs to a step that is done');
  heardFrom(world, 'warden_guide');
  assert.deepEqual(offered(world), ['warden_guide_between'], 'the warning was offered before it was heard');
  heardFrom(world, 'warden_guide');
  assert.deepEqual(offered(world), ['warden_guide_between', 'warden_guide_gate']);
  world.flags['keeper_defeated'] = 'yes';
  assert.deepEqual(offered(world), ['warden_guide_between'], 'the last word was offered before it was heard');
  heardFrom(world, 'warden_guide');
  assert.deepEqual(offered(world), ['warden_guide_between', 'warden_guide_after']);
});

void test('hearing it again plays the step\'s lines in order as one conversation and changes nothing in the world, the quests, the flags or the save', (): void => {
  const world: World = atTheGate();
  const opened: WorldEvent[] = talkTo(world, 'warden_guide');
  assert.deepEqual(ofType(opened, 'dialogue_line').map((event): string => event.line.id), ['warden_guide_road']);
  assert.ok(canReplay(world));
  const before: string = settled(world);
  const lines: EventOf<'dialogue_line'>[] = ofType(send(world, { type: 'replay' }), 'dialogue_line');
  assert.ok(dialogueOf(world).replay);
  assert.equal(canReplay(world), false, 'a replay offered itself again');
  const rest: WorldEvent[] = finish(world);
  lines.push(...ofType(rest, 'dialogue_line'));
  assert.deepEqual(lines.map((event): string => event.line.id), [...FIRE.between, ...FIRE.gate]);
  assert.deepEqual(lines.map((event): number => event.index), lines.map((_, index: number): number => index));
  assert.deepEqual(lines.map((event): boolean => event.last), lines.map((_, index: number): boolean => index === lines.length - 1));
  assert.deepEqual(ofType(rest, 'dialogue_closed').map((event): [boolean, boolean] => [event.finished, event.replay]), [[true, true]]);
  assert.deepEqual(rest.filter((event: WorldEvent): boolean => event.type.startsWith('quest_') || event.type === 'act_ended' || event.type === 'skill_unlocked'), []);
  assert.equal(settled(world), before);
});

void test('a replay never completes a talk objective, and a first hearing of the everyday line still does', (): void => {
  const errand: QuestDef = { id: 'errand', name: 'An Errand', requires: [], when: [], objectives: [{ id: 'ask', type: 'talk', npc: 'warden_guide', talk: null, text: 'Ask', waiting: '', when: [], sets: { asked: 'yes' }, gift: null }] };
  const world: World = atTheGate({ ...SHIPPED, quests: new Map([...SHIPPED.quests, [errand.id, errand]]) });
  world.quests['errand'] = 0;
  talkTo(world, 'warden_guide');
  send(world, { type: 'replay' });
  finish(world);
  assert.equal(world.quests['errand'], 0);
  assert.equal(world.flags['asked'], undefined);
  talkTo(world, 'warden_guide');
  finish(world);
  assert.equal(world.quests['errand'], 1);
});

void test('a first hearing offers no replay, and with nothing of the step heard the command does nothing', (): void => {
  const world: World = atTheFire();
  heardFrom(world, 'warden_guide');
  talkTo(world, 'warden_guide');
  assert.equal(dialogueOf(world).talk.id, 'warden_guide_between');
  assert.equal(canReplay(world), false, 'a first hearing offered a replay');
  assert.deepEqual(ofType(send(world, { type: 'replay' }), 'dialogue_line'), []);
  assert.equal(dialogueOf(world).talk.id, 'warden_guide_between');
  const quiet: World = atTheFire();
  quiet.quests['wardens_lesson'] = 1;
  talkTo(quiet, 'warden_guide');
  assert.equal(dialogueOf(quiet).talk.id, 'warden_guide_talk');
  assert.equal(canReplay(quiet), false, 'a replay was offered with nothing heard');
  assert.deepEqual(ofType(send(quiet, { type: 'replay' }), 'dialogue_line'), []);
  assert.equal(dialogueOf(quiet).replay, false);
});

void test('someone with nothing new and no everyday line tells the step\'s talks again when spoken to', (): void => {
  const guide: NpcDef = must(SHIPPED.npcs.get('warden_guide'), 'the Guide');
  const quiet: NpcDef = { ...guide, talks: guide.talks.filter((talk: TalkDef): boolean => talk.once) };
  const world: World = atTheGate({ ...SHIPPED, npcs: new Map([...SHIPPED.npcs, [guide.id, quiet]]) });
  const lines: string[] = ofType(talkTo(world, 'warden_guide'), 'dialogue_line').map((event): string => event.line.id);
  assert.ok(dialogueOf(world).replay);
  lines.push(...ofType(finish(world), 'dialogue_line').map((event): string => event.line.id));
  assert.deepEqual(lines, [...FIRE.between, ...FIRE.gate]);
});
