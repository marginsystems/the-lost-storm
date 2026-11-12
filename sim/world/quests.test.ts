import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn, zoneOf } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { ActDef, Condition, Content, NpcDef, QuestDef, TalkDef, ZoneDef, ZoneExit, ZoneNpc } from '../content/types.ts';
import { allHold, holds, objectiveState, questState } from './conditions.ts';
import { createWorld } from './create.ts';
import { nextTalk } from './dialogue.ts';
import { spawnPacks } from './monsters.ts';
import { activeQuests, currentObjective } from './quests.ts';
import { stepWorld } from './step.ts';
import type { Command, MonsterState, NpcState, World, WorldEvent } from './types.ts';
import { enterZone } from './zones.ts';
import { roadWorld, roadZone } from '../../test/road-support.ts';

const shipped: Content = loadContent();
const DT: number = 1 / 60;
const LIMIT: number = 40;

type EventOf<T extends WorldEvent['type']> = Extract<WorldEvent, { readonly type: T }>;

function ofType<T extends WorldEvent['type']>(events: readonly WorldEvent[], type: T): EventOf<T>[] {
  return events.filter((event: WorldEvent): event is EventOf<T> => event.type === type);
}

const errand: QuestDef = {
  id: 'errand',
  name: 'An Errand',
  requires: [],
  when: [],
  objectives: [
    { id: 'ask', type: 'talk', npc: 'maren', text: 'Ask', when: [], sets: {} },
    { id: 'go', type: 'reach', zone: 'stillhold', x: 30, z: 20, radius: 1.5, text: 'Go', when: [], sets: {} },
    { id: 'kill', type: 'defeat', monster: 'hex_caller', text: 'Kill', when: [], sets: {} },
  ],
};

const sequel: QuestDef = { id: 'sequel', name: 'After', requires: ['errand'], when: [], objectives: [{ id: 'tell', type: 'talk', npc: 'hale', text: 'Tell', when: [], sets: {} }] };

function during(objective: string): Condition[] {
  return [{ type: 'objective', quest: 'errand', objective, is: 'current', not: false }];
}

function unconditional(def: NpcDef): NpcDef {
  return { ...def, talks: def.talks.map((talk: TalkDef): TalkDef => ({ id: talk.id, once: talk.once, when: [], lines: talk.lines })) };
}

function staged(): Content {
  const town: ZoneDef = zoneOf(shipped, 'stillhold');
  const bastion: ZoneDef = zoneOf(shipped, 'drowned_bastion');
  const locked: Condition[] = [{ type: 'objective', quest: 'errand', objective: 'go', is: 'done', not: false }];
  const gated: ZoneDef = {
    ...town,
    exits: town.exits.map((exit: ZoneExit): ZoneExit => ({ id: exit.id, x: exit.x, z: exit.z, radius: exit.radius, to: exit.to, toExit: exit.toExit, arrival: exit.arrival, requires: locked, lockedHint: 'Not yet', hiddenWhenLocked: false })),
    npcs: [...town.npcs.map((placed: ZoneNpc): ZoneNpc => ({ npc: placed.npc, x: placed.x, z: placed.z, facingDegrees: placed.facingDegrees, when: [] })), { npc: 'hale', x: 30, z: 24, facingDegrees: 0, when: during('kill') }],
  };
  const maren: NpcDef = must(shipped.npcs.get('maren'), 'maren');
  const hale: NpcDef = must(shipped.npcs.get('hale'), 'hale');
  return {
    ...shipped,
    quests: new Map<string, QuestDef>([
      [errand.id, errand],
      [sequel.id, sequel],
    ]),
    zones: new Map<string, ZoneDef>([
      [gated.id, gated],
      [bastion.id, bastion],
    ]),
    npcs: new Map<string, NpcDef>([
      [maren.id, unconditional(maren)],
      [hale.id, unconditional(hale)],
    ]),
  };
}

function send(world: World, ...commands: Command[]): WorldEvent[] {
  return stepWorld(world, commands, DT);
}

function until(world: World, done: () => boolean, first: readonly Command[] = []): WorldEvent[] {
  const events: WorldEvent[] = [];
  const steps: number = Math.round(LIMIT / DT);
  for (let step: number = 0; step < steps; step += 1) {
    events.push(...stepWorld(world, step === 0 ? first : [], DT));
    if (done()) break;
  }
  return events;
}

function converse(world: World, npcId: string): WorldEvent[] {
  const npc: NpcState = must(world.npcs.find((candidate: NpcState): boolean => candidate.def.id === npcId), npcId);
  const events: WorldEvent[] = until(world, (): boolean => world.dialogue !== null, [{ type: 'talk', npcId: npc.id }]);
  for (let guard: number = 0; guard < 40 && world.dialogue !== null; guard += 1) events.push(...send(world, { type: 'advance' }));
  return events;
}

void test('a quest with no requirements starts with the world and one that requires it stays locked', (): void => {
  const world: World = createWorld(staged(), { seed: 1, save: null });
  assert.deepEqual(world.quests, { errand: 0 });
  assert.equal(questState(world, 'errand'), 'active');
  assert.equal(questState(world, 'sequel'), 'locked');
  assert.equal(questState(world, 'no_such_quest'), 'locked');
  assert.deepEqual(activeQuests(world).map((quest: QuestDef): string => quest.id), ['errand']);
  assert.equal(currentObjective(world, errand)?.id, 'ask');
  assert.equal(currentObjective(world, sequel), null);
  assert.equal(world.events.length, 0);
});

void test('conditions read locked, active and done quests and pending, current and done objectives', (): void => {
  const world: World = createWorld(staged(), { seed: 2, save: null });
  world.quests = { errand: 1 };
  assert.equal(objectiveState(world, 'errand', 'ask'), 'done');
  assert.equal(objectiveState(world, 'errand', 'go'), 'current');
  assert.equal(objectiveState(world, 'errand', 'kill'), 'pending');
  assert.equal(objectiveState(world, 'errand', 'no_such'), 'pending');
  assert.equal(objectiveState(world, 'sequel', 'tell'), 'pending');
  assert.equal(holds(world, { type: 'quest', quest: 'errand', is: 'active', not: false }), true);
  assert.equal(holds(world, { type: 'quest', quest: 'sequel', is: 'locked', not: false }), true);
  assert.equal(holds(world, { type: 'quest', quest: 'errand', is: 'done', not: false }), false);
  assert.equal(allHold(world, []), true);
  assert.equal(allHold(world, [...during('go'), { type: 'quest', quest: 'sequel', is: 'locked', not: false }]), true);
  assert.equal(allHold(world, [...during('go'), { type: 'quest', quest: 'sequel', is: 'active', not: false }]), false);
  world.quests = { errand: 3 };
  assert.equal(questState(world, 'errand'), 'done');
  assert.equal(objectiveState(world, 'errand', 'kill'), 'done');
});

void test('a talk objective is done by finishing a conversation with that npc, not by starting one or by talking to someone else', (): void => {
  const world: World = createWorld(staged(), { seed: 3, save: null });
  const other: WorldEvent[] = converse(world, 'hale');
  assert.equal(ofType(other, 'quest_advanced').length, 0);
  const maren: NpcState = must(world.npcs.find((npc: NpcState): boolean => npc.def.id === 'maren'), 'maren');
  until(world, (): boolean => world.dialogue !== null, [{ type: 'talk', npcId: maren.id }]);
  send(world, { type: 'stop' });
  assert.deepEqual(world.quests, { errand: 0 });
  const events: WorldEvent[] = converse(world, 'maren');
  assert.deepEqual(ofType(events, 'quest_advanced'), [{ type: 'quest_advanced', quest: 'errand', objective: 'ask' }]);
  assert.deepEqual(world.quests, { errand: 1 });
});

void test('a reach objective is done by standing in the circle, in the right zone, only while it is current', (): void => {
  const world: World = createWorld(staged(), { seed: 4, save: null });
  until(world, (): boolean => world.player.intent.type === 'idle', [{ type: 'move', held: false, dest: { x: 30, z: 20 } }]);
  assert.deepEqual(world.quests, { errand: 0 });
  world.quests = { errand: 1 };
  const events: WorldEvent[] = send(world);
  assert.deepEqual(ofType(events, 'quest_advanced'), [{ type: 'quest_advanced', quest: 'errand', objective: 'go' }]);
  const elsewhere: World = worldIn(staged(), 'drowned_bastion', 4);
  elsewhere.quests = { errand: 1 };
  elsewhere.monsters = [];
  until(elsewhere, (): boolean => elsewhere.player.intent.type === 'idle', [{ type: 'move', held: false, dest: { x: 30, z: 20 } }]);
  assert.deepEqual(elsewhere.quests, { errand: 1 });
});

void test('a defeat objective is done when a monster of that kind dies, and completing a quest starts the next', (): void => {
  const world: World = worldIn(staged(), 'drowned_bastion', 5);
  world.quests = { errand: 2 };
  const caller: MonsterState = must(world.monsters.find((monster: MonsterState): boolean => monster.def.id === 'hex_caller'), 'caller');
  const thrall: MonsterState = must(world.monsters.find((monster: MonsterState): boolean => monster.def.id === 'bone_thrall'), 'thrall');
  for (const victim of [thrall, caller]) {
    world.monsters = [victim];
    victim.spawnTime = 0;
    victim.life = 1;
    victim.pos = { x: world.player.pos.x, z: world.player.pos.z - 1.5 };
    world.player.cooldowns = {};
    const events: WorldEvent[] = until(world, (): boolean => !victim.alive, [{ type: 'skill', slot: 0, aim: victim.pos, targetId: victim.id }]);
    if (victim === thrall) {
      assert.equal(ofType(events, 'quest_advanced').length, 0);
      continue;
    }
    assert.deepEqual(ofType(events, 'quest_advanced'), [{ type: 'quest_advanced', quest: 'errand', objective: 'kill' }]);
    assert.deepEqual(ofType(events, 'quest_completed'), [{ type: 'quest_completed', quest: 'errand' }]);
    assert.deepEqual(ofType(events, 'quest_started'), [{ type: 'quest_started', quest: 'sequel' }]);
  }
  assert.deepEqual(world.quests, { errand: 3, sequel: 0 });
  assert.equal(questState(world, 'errand'), 'done');
});

void test('an exit with a requirement refuses travel with its hint until the condition holds', (): void => {
  const world: World = createWorld(staged(), { seed: 6, save: null });
  const refused: WorldEvent[] = send(world, { type: 'travel', exit: 'bastion_stair' });
  assert.deepEqual(ofType(refused, 'exit_locked'), [{ type: 'exit_locked', exit: 'bastion_stair', hint: 'Not yet' }]);
  assert.deepEqual(world.player.intent, { type: 'idle' });
  world.quests = { errand: 2 };
  const allowed: WorldEvent[] = until(world, (): boolean => world.zone.id !== 'stillhold', [{ type: 'travel', exit: 'bastion_stair' }]);
  assert.equal(ofType(allowed, 'exit_locked').length, 0);
  assert.equal(world.zone.id, 'drowned_bastion');
});

void test('a conversation with a condition is offered only while the condition holds', (): void => {
  const world: World = createWorld(shipped, { seed: 7, save: null });
  const hale: NpcDef = must(shipped.npcs.get('hale'), 'hale');
  const maren: NpcDef = must(shipped.npcs.get('maren'), 'maren');
  assert.equal(nextTalk(world, maren)?.id, 'maren_wake');
  assert.equal(nextTalk(world, hale)?.id, 'hale_idle');
  world.quests = { fallen_in: 1 };
  assert.equal(nextTalk(world, hale)?.id, 'hale_first');
  assert.equal(nextTalk(world, maren)?.id, 'maren_idle');
  world.quests = { fallen_in: 2 };
  assert.equal(nextTalk(world, hale)?.id, 'hale_idle');
});

void test('an npc placed with a condition arrives and leaves as the quest moves, and its conversation closes when it goes', (): void => {
  const world: World = createWorld(staged(), { seed: 8, save: null });
  const count = (): number => world.npcs.filter((npc: NpcState): boolean => npc.def.id === 'hale').length;
  assert.equal(count(), 1);
  const stayed: number[] = world.npcs.map((npc: NpcState): number => npc.id);
  world.quests = { errand: 1 };
  until(world, (): boolean => world.quests['errand'] === 2, [{ type: 'move', held: false, dest: { x: 30, z: 20 } }]);
  assert.equal(count(), 2);
  assert.ok(stayed.every((id: number): boolean => world.npcs.some((npc: NpcState): boolean => npc.id === id)));
  const visitor: NpcState = must(world.npcs.find((npc: NpcState): boolean => !stayed.includes(npc.id)), 'visitor');
  assert.deepEqual(visitor.pos, { x: 30, z: 24 });
  until(world, (): boolean => world.dialogue !== null, [{ type: 'talk', npcId: visitor.id }]);
  assert.equal(world.dialogue?.npcId, visitor.id);
  world.quests = { errand: 3 };
  const events: WorldEvent[] = [];
  world.events = events;
  world.quests = { errand: 2 };
  const caller: MonsterState = { ...must(worldIn(staged(), 'drowned_bastion', 8).monsters.find((monster: MonsterState): boolean => monster.def.id === 'hex_caller'), 'caller'), alive: false };
  world.monsters = [caller];
  world.events.push({ type: 'death', actorId: caller.id, team: 'monster', pos: caller.pos, direction: { x: 0, z: 1 } });
  const after: WorldEvent[] = send(world);
  assert.equal(world.quests['errand'], 2);
  assert.equal(ofType(after, 'quest_advanced').length, 0);
  assert.equal(count(), 2);
});

void test('a condition marked not holds exactly when the plain one does not', (): void => {
  const world: World = createWorld(staged(), { seed: 2, save: null });
  const plain: Condition = { type: 'objective', quest: 'errand', objective: 'go', is: 'done', not: false };
  const negated: Condition = { ...plain, not: true };
  for (const progress of [0, 1, 2, 3]) {
    world.quests = { errand: progress };
    assert.notEqual(holds(world, negated), holds(world, plain), `progress ${progress}`);
  }
  world.quests = { errand: 1 };
  assert.equal(holds(world, negated), true);
  assert.equal(allHold(world, [negated, ...during('go')]), true);
  world.quests = { errand: 2 };
  assert.equal(holds(world, negated), false);
  assert.equal(allHold(world, [negated, ...during('kill')]), false);
  assert.equal(holds(world, { type: 'quest', quest: 'sequel', is: 'active', not: true }), true);
});

function hunted(): Content {
  const bastion: ZoneDef = zoneOf(shipped, 'drowned_bastion');
  const den = must(bastion.packs[0], 'a pack in the bastion');
  const hunt: QuestDef = {
    id: 'errand',
    name: 'A Hunt',
    requires: [], when: [],
    objectives: [
      { id: 'go', type: 'reach', zone: bastion.id, x: bastion.playerStart.x, z: bastion.playerStart.z, radius: 2, text: 'Go', when: [], sets: {} },
      { id: 'kill', type: 'defeat', monster: 'hex_caller', text: 'Kill', when: [], sets: {} },
    ],
  };
  const lair: ZoneDef = { ...bastion, packs: [{ x: den.x, z: den.z, members: [{ monster: 'hex_caller', count: 1, mods: [] }], when: during('kill') }] };
  return { ...shipped, quests: new Map<string, QuestDef>([[hunt.id, hunt]]), zones: new Map<string, ZoneDef>([...shipped.zones, [lair.id, lair]]) };
}

void test('a pack whose condition starts to hold while the hero is in the zone appears then, and once a visit', (): void => {
  const content: Content = hunted();
  const world: World = worldIn(content, 'drowned_bastion', 6);
  assert.deepEqual(world.quests, { errand: 0 });
  assert.equal(world.monsters.length, 0);
  const events: WorldEvent[] = send(world);
  assert.deepEqual(ofType(events, 'quest_advanced'), [{ type: 'quest_advanced', quest: 'errand', objective: 'go' }]);
  assert.equal(ofType(events, 'monster_spawn').length, 1);
  assert.deepEqual(world.monsters.map((monster: MonsterState): string => monster.def.id), ['hex_caller']);
  spawnPacks(world);
  assert.equal(ofType(send(world), 'monster_spawn').length, 0);
  assert.equal(world.monsters.length, 1);
  enterZone(world, zoneOf(content, 'drowned_bastion'), { type: 'start' });
  assert.equal(world.monsters.length, 1);
  world.quests = { errand: 2 };
  enterZone(world, zoneOf(content, 'drowned_bastion'), { type: 'start' });
  assert.equal(world.monsters.length, 0);
});

const crossing: QuestDef = {
  id: 'crossing',
  name: 'The Crossing',
  requires: [],
  when: [],
  objectives: [
    {
      id: 'through',
      type: 'either',
      text: 'Get through',
      when: [],
      sets: { crossed: 'yes' },
      paths: [
        { id: 'fight', type: 'reach', zone: 'road_test', x: 28, z: 8, radius: 2, text: 'Fight through', when: [], sets: { crossing: 'fought' } },
        { id: 'quiet', type: 'reach', zone: 'road_test', x: 4, z: 14, radius: 2, text: 'Go quietly', when: [{ type: 'flag', flag: 'token', is: 'carried', not: false }], sets: { crossing: 'quiet' } },
      ],
    },
    { id: 'after', type: 'reach', zone: 'road_test', x: 16, z: 8, radius: 2, text: 'After', when: [], sets: {} },
  ],
};

function crossingWorld(): World {
  return roadWorld(roadZone({}), { quests: new Map<string, QuestDef>([[crossing.id, crossing]]) });
}

void test('an either objective is done by whichever path is met first, and sets that path\'s flags', (): void => {
  const world: World = crossingWorld();
  world.player.pos = { x: 28, z: 8 };
  stepWorld(world, [], DT);
  assert.equal(currentObjective(world, crossing)?.id, 'after');
  assert.equal(world.flags['crossing'], 'fought');
  assert.equal(world.flags['crossed'], 'yes');
});

void test('a path with a condition cannot be met until the condition holds', (): void => {
  const world: World = crossingWorld();
  world.player.pos = { x: 4, z: 14 };
  stepWorld(world, [], DT);
  assert.equal(currentObjective(world, crossing)?.id, 'through');
  world.flags['token'] = 'carried';
  stepWorld(world, [], DT);
  assert.equal(currentObjective(world, crossing)?.id, 'after');
  assert.equal(world.flags['crossing'], 'quiet');
});

void test('an act that ends on a quest being done reports its end when the last objective is met', (): void => {
  const acts: ActDef[] = shipped.world.acts.map((act: ActDef): ActDef => ({ ...act, end: { when: [{ type: 'quest', quest: 'crossing', is: 'done', not: false }], line: 'Done.' } }));
  const world: World = roadWorld(roadZone({}), { quests: new Map<string, QuestDef>([[crossing.id, crossing]]), world: { ...shipped.world, acts } });
  world.player.pos = { x: 28, z: 8 };
  stepWorld(world, [], DT);
  world.player.pos = { x: 16, z: 8 };
  const events: WorldEvent[] = stepWorld(world, [], DT);
  assert.equal(ofType(events, 'act_ended').length, 1);
});
