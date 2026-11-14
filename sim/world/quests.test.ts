import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn, zoneOf } from '../../test/support.ts';
import { COURIER, KEEPER, TOWN_CONTENT } from '../../test/town-support.ts';
import type { ActDef, Condition, Content, NpcDef, QuestDef, TalkDef, ZoneDef, ZoneExit, ZoneNpc } from '../content/types.ts';
import { loadContent } from '../content/content.ts';
import { allHold, holds, objectiveState, questState } from './conditions.ts';
import { createWorld } from './create.ts';
import { toSave } from '../save.ts';
import { nextTalk } from './dialogue.ts';
import { spawnPacks } from './monsters.ts';
import { activeQuests, currentObjective, startQuests } from './quests.ts';
import { stepWorld } from './step.ts';
import type { Command, MomentState, MonsterState, NpcState, World, WorldEvent } from './types.ts';
import { enterZone } from './zones.ts';
import { choicesOpen } from './death.ts';
import { questMarks } from './map-marks.ts';
import { questTarget } from './objective.ts';
import type { QuestMark } from './map-marks.ts';
import { forceStrike, nearestFight } from './moments.ts';
import { echoesOf, slay, standAt } from '../../test/moment-support.ts';
import { ROAD_CONTENT, roadWorld, roadZone } from '../../test/road-support.ts';

const shipped: Content = TOWN_CONTENT;
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
    { id: 'ask', type: 'talk', npc: 'keeper', text: 'Ask', when: [], sets: {} },
    { id: 'go', type: 'reach', zone: 'hub', x: 20, z: 18, radius: 1.5, text: 'Go', when: [], sets: {} },
    { id: 'kill', type: 'defeat', monster: 'mender', text: 'Kill', when: [], sets: {} },
  ],
};

const sequel: QuestDef = { id: 'sequel', name: 'After', requires: ['errand'], when: [], objectives: [{ id: 'tell', type: 'talk', npc: 'courier', text: 'Tell', when: [], sets: {} }] };

function during(objective: string): Condition[] {
  return [{ type: 'objective', quest: 'errand', objective, is: 'current', not: false }];
}

function unconditional(def: NpcDef): NpcDef {
  return { ...def, talks: def.talks.map((talk: TalkDef): TalkDef => ({ id: talk.id, once: talk.once, when: [], lines: talk.lines })) };
}

function staged(): Content {
  const town: ZoneDef = zoneOf(shipped, 'hub');
  const outpost: ZoneDef = zoneOf(shipped, 'outpost');
  const locked: Condition[] = [{ type: 'objective', quest: 'errand', objective: 'go', is: 'done', not: false }];
  const gated: ZoneDef = {
    ...town,
    exits: town.exits.map((exit: ZoneExit): ZoneExit => ({ id: exit.id, x: exit.x, z: exit.z, radius: exit.radius, to: exit.to, toExit: exit.toExit, arrival: exit.arrival, requires: locked, lockedHint: 'Not yet', hiddenWhenLocked: false, look: 'ring' })),
    npcs: [...town.npcs.map((placed: ZoneNpc): ZoneNpc => ({ npc: placed.npc, x: placed.x, z: placed.z, facingDegrees: placed.facingDegrees, when: [] })), { npc: 'courier', x: 18, z: 20, facingDegrees: 0, when: during('kill') }],
  };
  const keeper: NpcDef = must(shipped.npcs.get('keeper'), 'keeper');
  const courier: NpcDef = must(shipped.npcs.get('courier'), 'courier');
  return {
    ...shipped,
    quests: new Map<string, QuestDef>([
      [errand.id, errand],
      [sequel.id, sequel],
    ]),
    zones: new Map<string, ZoneDef>([
      [gated.id, gated],
      [outpost.id, outpost],
    ]),
    npcs: new Map<string, NpcDef>([
      [keeper.id, unconditional(keeper)],
      [courier.id, unconditional(courier)],
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
  const other: WorldEvent[] = converse(world, 'courier');
  assert.equal(ofType(other, 'quest_advanced').length, 0);
  const keeper: NpcState = must(world.npcs.find((npc: NpcState): boolean => npc.def.id === 'keeper'), 'keeper');
  until(world, (): boolean => world.dialogue !== null, [{ type: 'talk', npcId: keeper.id }]);
  send(world, { type: 'stop' });
  assert.deepEqual(world.quests, { errand: 0 });
  const events: WorldEvent[] = converse(world, 'keeper');
  assert.deepEqual(ofType(events, 'quest_advanced'), [{ type: 'quest_advanced', quest: 'errand', objective: 'ask' }]);
  assert.deepEqual(world.quests, { errand: 1 });
});

void test('a reach objective is done by standing in the circle, in the right zone, only while it is current', (): void => {
  const world: World = createWorld(staged(), { seed: 4, save: null });
  until(world, (): boolean => world.player.intent.type === 'idle', [{ type: 'move', held: false, dest: { x: 20, z: 18 } }]);
  assert.deepEqual(world.quests, { errand: 0 });
  world.quests = { errand: 1 };
  const events: WorldEvent[] = send(world);
  assert.deepEqual(ofType(events, 'quest_advanced'), [{ type: 'quest_advanced', quest: 'errand', objective: 'go' }]);
  const elsewhere: World = worldIn(staged(), 'outpost', 4);
  elsewhere.quests = { errand: 1 };
  elsewhere.monsters = [];
  until(elsewhere, (): boolean => elsewhere.player.intent.type === 'idle', [{ type: 'move', held: false, dest: { x: 20, z: 18 } }]);
  assert.deepEqual(elsewhere.quests, { errand: 1 });
});

void test('a defeat objective is done when a monster of that kind dies, and completing a quest starts the next', (): void => {
  const world: World = worldIn(staged(), 'outpost', 5);
  world.quests = { errand: 2 };
  const caller: MonsterState = must(world.monsters.find((monster: MonsterState): boolean => monster.def.id === 'mender'), 'caller');
  const thrall: MonsterState = must(world.monsters.find((monster: MonsterState): boolean => monster.def.id === 'mended'), 'thrall');
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
  const refused: WorldEvent[] = send(world, { type: 'travel', exit: 'outpost_stair' });
  assert.deepEqual(ofType(refused, 'exit_locked'), [{ type: 'exit_locked', exit: 'outpost_stair', hint: 'Not yet' }]);
  assert.deepEqual(world.player.intent, { type: 'idle' });
  world.quests = { errand: 2 };
  const allowed: WorldEvent[] = until(world, (): boolean => world.zone.id !== 'hub', [{ type: 'travel', exit: 'outpost_stair' }]);
  assert.equal(ofType(allowed, 'exit_locked').length, 0);
  assert.equal(world.zone.id, 'outpost');
});

void test('a conversation with a condition is offered only while the condition holds', (): void => {
  const world: World = createWorld(staged(), { seed: 7, save: null });
  const guide: NpcDef = { ...KEEPER, id: 'guide', talks: [{ id: 'guide_wake', once: true, when: during('ask'), lines: ['keeper_first_1'] }, { id: 'guide_idle', once: false, when: [], lines: ['keeper_idle_1'] }] };
  const runner: NpcDef = { ...COURIER, id: 'runner', talks: [{ id: 'runner_first', once: true, when: during('go'), lines: ['courier_first_1'] }, { id: 'runner_idle', once: false, when: [], lines: ['courier_idle_1'] }] };
  assert.equal(nextTalk(world, guide)?.id, 'guide_wake');
  assert.equal(nextTalk(world, runner)?.id, 'runner_idle');
  world.quests = { errand: 1 };
  assert.equal(nextTalk(world, runner)?.id, 'runner_first');
  assert.equal(nextTalk(world, guide)?.id, 'guide_idle');
  world.quests = { errand: 2 };
  assert.equal(nextTalk(world, runner)?.id, 'runner_idle');
});

void test('an npc placed with a condition arrives and leaves as the quest moves, and its conversation closes when it goes', (): void => {
  const world: World = createWorld(staged(), { seed: 8, save: null });
  const count = (): number => world.npcs.filter((npc: NpcState): boolean => npc.def.id === 'courier').length;
  assert.equal(count(), 1);
  const stayed: number[] = world.npcs.map((npc: NpcState): number => npc.id);
  world.quests = { errand: 1 };
  until(world, (): boolean => world.quests['errand'] === 2, [{ type: 'move', held: false, dest: { x: 20, z: 18 } }]);
  assert.equal(count(), 2);
  assert.ok(stayed.every((id: number): boolean => world.npcs.some((npc: NpcState): boolean => npc.id === id)));
  const visitor: NpcState = must(world.npcs.find((npc: NpcState): boolean => !stayed.includes(npc.id)), 'visitor');
  assert.deepEqual(visitor.pos, { x: 18, z: 20 });
  until(world, (): boolean => world.dialogue !== null, [{ type: 'talk', npcId: visitor.id }]);
  assert.equal(world.dialogue?.npcId, visitor.id);
  world.quests = { errand: 3 };
  const events: WorldEvent[] = [];
  world.events = events;
  world.quests = { errand: 2 };
  const caller: MonsterState = { ...must(worldIn(staged(), 'outpost', 8).monsters.find((monster: MonsterState): boolean => monster.def.id === 'mender'), 'caller'), alive: false };
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
  const outpost: ZoneDef = zoneOf(shipped, 'outpost');
  const den = must(outpost.packs[0], 'a pack in the outpost');
  const hunt: QuestDef = {
    id: 'errand',
    name: 'A Hunt',
    requires: [], when: [],
    objectives: [
      { id: 'go', type: 'reach', zone: outpost.id, x: outpost.playerStart.x, z: outpost.playerStart.z, radius: 2, text: 'Go', when: [], sets: {} },
      { id: 'kill', type: 'defeat', monster: 'mender', text: 'Kill', when: [], sets: {} },
    ],
  };
  const lair: ZoneDef = { ...outpost, packs: [{ x: den.x, z: den.z, members: [{ monster: 'mender', count: 1, mods: [] }], when: during('kill') }] };
  return { ...shipped, quests: new Map<string, QuestDef>([[hunt.id, hunt]]), zones: new Map<string, ZoneDef>([...shipped.zones, [lair.id, lair]]) };
}

void test('a pack whose condition starts to hold while the hero is in the zone appears then, and once a visit', (): void => {
  const content: Content = hunted();
  const world: World = worldIn(content, 'outpost', 6);
  assert.deepEqual(world.quests, { errand: 0 });
  assert.equal(world.monsters.length, 0);
  const events: WorldEvent[] = send(world);
  assert.deepEqual(ofType(events, 'quest_advanced'), [{ type: 'quest_advanced', quest: 'errand', objective: 'go' }]);
  assert.equal(ofType(events, 'monster_spawn').length, 1);
  assert.deepEqual(world.monsters.map((monster: MonsterState): string => monster.def.id), ['mender']);
  spawnPacks(world);
  assert.equal(ofType(send(world), 'monster_spawn').length, 0);
  assert.equal(world.monsters.length, 1);
  enterZone(world, zoneOf(content, 'outpost'), { type: 'start' });
  assert.equal(world.monsters.length, 1);
  world.quests = { errand: 2 };
  enterZone(world, zoneOf(content, 'outpost'), { type: 'start' });
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
  const acts: ActDef[] = ROAD_CONTENT.world.acts.map((act: ActDef): ActDef => ({ ...act, end: { when: [{ type: 'quest', quest: 'crossing', is: 'done', not: false }], line: 'Done.' } }));
  const world: World = roadWorld(roadZone({}), { quests: new Map<string, QuestDef>([[crossing.id, crossing]]), world: { ...ROAD_CONTENT.world, acts } });
  world.player.pos = { x: 28, z: 8 };
  stepWorld(world, [], DT);
  world.player.pos = { x: 16, z: 8 };
  const events: WorldEvent[] = stepWorld(world, [], DT);
  assert.equal(ofType(events, 'act_ended').length, 1);
});

void test('reaching the fire marks the camp, and the slice ends only once a moment is cleared and the Warden has given the lesson', (): void => {
  const content: Content = loadContent();
  const outOfMist: QuestDef = must(content.quests.get('out_of_the_mist'), 'quest');
  const firstTaker: QuestDef = must(content.quests.get('the_first_taker'), 'quest');
  const world: World = worldIn(content, 'hideout', 9);
  world.quests = { out_of_the_mist: outOfMist.objectives.length, the_first_taker: firstTaker.objectives.length };
  startQuests(world);
  world.player.pos = { x: 24, z: 20 };
  stepWorld(world, [], DT);
  assert.equal(questState(world, 'to_the_waystation'), 'done');
  assert.equal(world.flags['camp'], 'reached');
  assert.equal(world.flags['alpha_slice_complete'], undefined);
  assert.equal(questState(world, 'wardens_lesson'), 'active');
  world.player.pos = { x: 20, z: 21 };
  converse(world, 'warden_guide');
  assert.equal(questState(world, 'wardens_lesson'), 'done');
  assert.equal(world.flags['alpha_slice_complete'], 'reached');
});

const HALL_ARRIVAL = { x: 14, z: 30 } as const;
const HIDEOUT_FIRE = { x: 24, z: 20 } as const;
const STRIKE_GAP = { x: 6, z: 0 } as const;
const FIGHT_LIMIT: number = 1800;
const BESIDE_THE_FIRE = { x: 3, z: 1 } as const;

function arrivedInHall(seed: number): World {
  const world: World = worldIn(loadContent(), 'hall_of_time', seed);
  standAt(world, HALL_ARRIVAL);
  stepWorld(world, [], DT);
  assert.equal(questState(world, 'out_of_the_mist'), 'done');
  return world;
}

function activeIds(world: World): string[] {
  return activeQuests(world).map((quest: QuestDef): string => quest.id);
}

function arrow(world: World): QuestMark {
  return must(questMarks(world)[0], 'objective arrow');
}

function exitOf(world: World, id: string): ZoneExit {
  return must(world.zone.exits.find((exit: ZoneExit): boolean => exit.id === id), id);
}

function struckBeside(world: World): MomentState {
  const at = { x: world.player.pos.x + STRIKE_GAP.x, z: world.player.pos.z + STRIKE_GAP.z };
  const moment: MomentState = must(forceStrike(world, at, null), 'strike');
  for (let step: number = 0; step < FIGHT_LIMIT && moment.phase === 'mark'; step += 1) stepWorld(world, [], DT);
  return moment;
}

function clearFirstMoment(world: World): void {
  const moment: MomentState = struckBeside(world);
  standAt(world, moment.pos);
  stepWorld(world, [], DT);
  stepWorld(world, [], DT);
  slay(world, echoesOf(world, moment));
  for (let step: number = 0; step < FIGHT_LIMIT && questState(world, 'the_first_taker') !== 'done'; step += 1) stepWorld(world, [], DT);
  assert.equal(moment.outcome, 'resolved');
}

function travel(world: World, zoneId: string, exit: string): void {
  enterZone(world, zoneOf(world.content, zoneId), { type: 'exit', exit });
  stepWorld(world, [], DT);
}

function standAtFire(world: World): void {
  standAt(world, HIDEOUT_FIRE);
  stepWorld(world, [], DT);
}

void test('on first arrival in the Hall the only objective is to clear a moment, and the arrow points at the nearest live bubble', (): void => {
  const world: World = arrivedInHall(4);
  assert.deepEqual(activeIds(world), ['the_first_taker']);
  assert.equal(questState(world, 'to_the_waystation'), 'locked');
  assert.equal(currentObjective(world, must(world.content.quests.get('the_first_taker'), 'quest'))?.text, 'Clear a moment');
  assert.equal(arrow(world).quest, 'the_first_taker');
  assert.equal(arrow(world).here, true);
  const moment: MomentState = struckBeside(world);
  assert.equal(nearestFight(world), moment);
  assert.deepEqual(arrow(world).pos, moment.pos);
  assert.equal(questMarks(world).length, 1);
});

void test('clear a moment, then go: shelter appears only after the clear, its arrow leads east, and the fire ends it', (): void => {
  const world: World = arrivedInHall(5);
  clearFirstMoment(world);
  assert.equal(world.flags['first_moment'] !== undefined, true);
  assert.deepEqual(activeIds(world), ['to_the_waystation']);
  const east: ZoneExit = exitOf(world, 'east');
  assert.deepEqual(arrow(world), { quest: 'to_the_waystation', pos: { x: east.x, z: east.z }, here: false });
  travel(world, 'hideout', 'west');
  assert.equal(arrow(world).here, true);
  standAtFire(world);
  assert.equal(questState(world, 'to_the_waystation'), 'done');
  assert.equal(world.flags['camp'], 'reached');
  assert.deepEqual(activeIds(world), ['wardens_lesson']);
});

void test('go without clearing: the fire gives no credit, the tracker keeps the moment with an arrow back to the Hall, and a clear then the fire finishes the chain', (): void => {
  const world: World = arrivedInHall(6);
  travel(world, 'hideout', 'west');
  standAtFire(world);
  assert.equal(questState(world, 'to_the_waystation'), 'locked');
  assert.equal(world.flags['camp'], undefined);
  assert.deepEqual(activeIds(world), ['the_first_taker']);
  const west: ZoneExit = exitOf(world, 'west');
  assert.deepEqual(arrow(world), { quest: 'the_first_taker', pos: { x: west.x, z: west.z }, here: false });
  travel(world, 'hall_of_time', 'east');
  assert.deepEqual(activeIds(world), ['the_first_taker']);
  clearFirstMoment(world);
  assert.deepEqual(activeIds(world), ['to_the_waystation']);
  travel(world, 'hideout', 'west');
  standAtFire(world);
  assert.equal(questState(world, 'to_the_waystation'), 'done');
  assert.deepEqual(activeIds(world), ['wardens_lesson']);
});

for (const choice of ['checkpoint', 'town'] as const) {
  void test(`die in the first fight, rise at the ${choice}: the moment is still owed, shelter stays locked, and the arrow leads back to a fight`, (): void => {
    const world: World = arrivedInHall(7);
    const moment: MomentState = struckBeside(world);
    standAt(world, { x: moment.pos.x + BESIDE_THE_FIRE.x, z: moment.pos.z + BESIDE_THE_FIRE.z });
    world.player.stats.lifeRegen = 0;
    world.player.invulnerable = 0;
    world.player.life = 1;
    for (let step: number = 0; step < FIGHT_LIMIT && world.player.alive; step += 1) stepWorld(world, [], DT);
    assert.equal(world.player.alive, false);
    for (let step: number = 0; step < FIGHT_LIMIT && !choicesOpen(world); step += 1) stepWorld(world, [], DT);
    stepWorld(world, [{ type: 'respawn', choice }], DT);
    stepWorld(world, [], DT);
    assert.equal(world.player.alive, true);
    assert.notEqual(moment.outcome, 'resolved');
    assert.equal(questState(world, 'the_first_taker'), 'active');
    assert.equal(questState(world, 'to_the_waystation'), 'locked');
    assert.deepEqual(activeIds(world), ['the_first_taker']);
    const mark: QuestMark = arrow(world);
    assert.equal(mark.quest, 'the_first_taker');
    if (world.zone.id === 'hideout') assert.deepEqual(mark.pos, { x: exitOf(world, 'west').x, z: exitOf(world, 'west').z });
    else assert.equal(mark.here, true);
    if (world.zone.id === 'hideout') travel(world, 'hall_of_time', 'east');
    clearFirstMoment(world);
    assert.deepEqual(activeIds(world), ['to_the_waystation']);
  });
}

void test('a save that started shelter before the first clear loads with shelter locked and the moment owed, and keeps any shelter already reached', (): void => {
  const content: Content = loadContent();
  const outOfMist: number = must(content.quests.get('out_of_the_mist'), 'quest').objectives.length;
  const older: World = createWorld(content, { seed: 8, save: null });
  older.quests = { out_of_the_mist: outOfMist, to_the_waystation: 0 };
  const loaded: World = createWorld(content, { seed: 8, save: toSave(older) });
  assert.equal(questState(loaded, 'to_the_waystation'), 'locked');
  assert.deepEqual(activeIds(loaded), ['the_first_taker']);
  const shelter: number = must(content.quests.get('to_the_waystation'), 'quest').objectives.length;
  older.quests = { out_of_the_mist: outOfMist, to_the_waystation: shelter };
  const reached: World = createWorld(content, { seed: 8, save: toSave(older) });
  assert.equal(questState(reached, 'to_the_waystation'), 'done');
  assert.equal(questState(reached, 'the_first_taker'), 'active');
});

void test('the Gate quest opens after the Warden\'s Lesson, names its level while the gate is shut, then leads to the gate and ends on the boss', (): void => {
  const content: Content = loadContent();
  const gateQuest: QuestDef = must([...content.quests.values()].find((quest: QuestDef): boolean => quest.objectives.some((objective): boolean => objective.type === 'defeat' && content.monsters.get(objective.monster)?.boss !== null)), 'a boss quest');
  const world: World = worldIn(content, 'hall_of_time', 9);
  startQuests(world);
  assert.equal(questState(world, gateQuest.id), 'locked');
  for (const quest of content.quests.values()) if (gateQuest.requires.includes(quest.id)) world.quests[quest.id] = quest.objectives.length;
  startQuests(world);
  assert.equal(questState(world, gateQuest.id), 'active');
  const objective = must(currentObjective(world, gateQuest), 'objective');
  world.player.level = 3;
  assert.equal(questTarget(world, gateQuest), null);
  assert.match(objective.text, /level 8/);
  world.player.level = 8;
  const target = must(questTarget(world, gateQuest), 'target');
  assert.equal(target.kind, 'exit');
  const gate: ZoneExit = must(world.zone.exits.find((exit: ZoneExit): boolean => exit.to === 'keepers_gate'), 'gate');
  assert.deepEqual(target.pos, { x: gate.x, z: gate.z });
  enterZone(world, zoneOf(content, 'keepers_gate'), { type: 'exit', exit: 'hall' });
  const boss: MonsterState = must(world.monsters.find((monster: MonsterState): boolean => monster.def.boss !== null), 'boss');
  boss.spawnTime = 0;
  boss.life = 1;
  world.player.pos = { x: boss.pos.x, z: boss.pos.z + 1.6 };
  world.player.bar = ['cleave', null, null, null, null, null];
  const events: WorldEvent[] = [];
  for (let step: number = 0; step < 120 && boss.alive; step += 1) events.push(...stepWorld(world, step % 10 === 0 ? [{ type: 'skill', slot: 0, aim: boss.pos, targetId: boss.id }] : [], DT));
  assert.equal(boss.alive, false);
  assert.equal(questState(world, gateQuest.id), 'done');
  assert.ok(ofType(events, 'quest_completed').some((event): boolean => event.quest === gateQuest.id));
});
