import assert from 'node:assert/strict';
import { test } from 'node:test';
import shippedWorld from '../../data/world.json' with { type: 'json' };
import hall from '../../data/zones/hall_of_time.json' with { type: 'json' };
import between from '../../data/zones/between.json' with { type: 'json' };
import type { WorldDef, ZoneDef } from './types.ts';
import { worldDef, zone } from './parse-world.ts';
import lines from '../../data/lines.json' with { type: 'json' };
import npcs from '../../data/npcs.json' with { type: 'json' };
import quests from '../../data/quests.json' with { type: 'json' };
import { PAIR_WORLD as world, SHALLOWS as shallows, WAYSTATION as waystation } from '../../test/pair-support.ts';
import { must, worldIn } from '../../test/support.ts';
import { contentProblems, parseContent } from './parse.ts';
import type { RawContent } from './parse.ts';
import type { Content, NpcDef, QuestDef } from './types.ts';
import { act, addedQuest, has, onlyQuest, problem, shipped, townWithGate, withZone, zones } from '../../test/parse-support.ts';

function parsed(change: Readonly<Record<string, unknown>>): ZoneDef {
  return zone({ ...hall, ...change }, 'zone');
}

void test('a zone without a level cap stays at its own level and one with a cap reads it', (): void => {
  const fixed: ZoneDef = parsed({ level: 3, levelUpTo: undefined });
  assert.equal(fixed.levelUpTo, 3);
  assert.equal(parsed({ level: 2, levelUpTo: 9 }).levelUpTo, 9);
});

void test('a zone cannot follow the hero below its own level', (): void => {
  assert.throws((): ZoneDef => parsed({ level: 5, levelUpTo: 4 }), /below its own level/);
});

void test('pack return rules are read when given and absent otherwise', (): void => {
  assert.deepEqual(parsed({ packReturn: { after: 30, away: 12 } }).packReturn, { after: 30, away: 12 });
  assert.equal(parsed({ packReturn: undefined }).packReturn, null);
  assert.throws((): ZoneDef => parsed({ packReturn: { after: 0, away: 12 } }));
});

function withGlimpses(glimpses: unknown): ZoneDef {
  return zone({ ...between, void: { ...between.void, glimpses } }, 'zone');
}

void test('void glimpses are read with a scale of one when none is given, and an empty glimpse is refused', (): void => {
  const read: ZoneDef = withGlimpses([{ pieces: [{ prop: 'castle_doorway', x: 1, z: -2, rotationDegrees: 15 }, { prop: 'castle_pier', x: 4, z: 0, rotationDegrees: 0, scale: 1.8 }] }]);
  assert.deepEqual(read.void?.glimpses, [{ pieces: [{ prop: 'castle_doorway', x: 1, z: -2, rotationDegrees: 15, scale: 1 }, { prop: 'castle_pier', x: 4, z: 0, rotationDegrees: 0, scale: 1.8 }] }]);
  assert.deepEqual(withGlimpses(undefined).void?.glimpses, []);
  assert.throws((): ZoneDef => withGlimpses([{ pieces: [] }]), /at least one piece/);
  assert.throws((): ZoneDef => withGlimpses([{ pieces: [{ prop: 'castle_pier', x: 0, z: 0, rotationDegrees: 0, scale: 0 }] }]));
});

function withScaling(scaling: Readonly<Record<string, unknown>>): WorldDef {
  return worldDef({ ...shippedWorld, scaling }, 'world');
}

void test('the monster toughness ramp is read when given, absent means flat, and a ramp that ends where it starts is refused', (): void => {
  const ramp = { from: 5, to: 10, lifePerLevel: 1.2, damagePerLevel: 1.12 };
  const flat = { lifePerLevel: 0.3, damagePerLevel: 0.28, xpPerLevel: 0.15 };
  assert.deepEqual(withScaling({ ...flat, ramp }).scaling.ramp, ramp);
  assert.equal(withScaling(flat).scaling.ramp, null);
  assert.throws((): WorldDef => withScaling({ ...flat, ramp: { ...ramp, to: 5 } }), /world\.scaling\.ramp\.to/);
  assert.throws((): WorldDef => withScaling({ ...flat, ramp: { ...ramp, lifePerLevel: -1 } }), /world\.scaling\.ramp/);
});

void test('monster life times are read in rising order, absent means none, and a falling level or a part level is refused', (): void => {
  const flat = { lifePerLevel: 0.3, damagePerLevel: 0.28, xpPerLevel: 0.15 };
  const lifeTimes = [{ level: 13, times: 1 }, { level: 20, times: 3.2 }];
  assert.deepEqual(withScaling({ ...flat, lifeTimes }).scaling.lifeTimes, lifeTimes);
  assert.deepEqual(withScaling(flat).scaling.lifeTimes, []);
  assert.throws((): WorldDef => withScaling({ ...flat, lifeTimes: [{ level: 20, times: 2 }, { level: 15, times: 3 }] }), /must rise/);
  assert.throws((): WorldDef => withScaling({ ...flat, lifeTimes: [{ level: 13.5, times: 2 }] }), /whole level/);
  assert.throws((): WorldDef => withScaling({ ...flat, lifeTimes: [{ level: 13, times: 0 }] }), /world\.scaling\.lifeTimes/);
});

void test('a zone parses with its kind, level, exits, checkpoints, surge rules and ambience', (): void => {
  const lit = { type: 'flag', flag: 'opening', is: 'read' };
  const dressed = { ...waystation, props: [...waystation.props, { prop: 'candles', x: 26, z: 30, y: 0, rotationDegrees: 0, when: [lit] }] };
  const content: Content = parseContent({ ...shipped, zones: zones(dressed, { ...shallows, surge: { delay: 5, surgesPerExtraMonster: 2, maxExtraMonsters: 3 }, checkpoints: [{ id: 'grate', x: 28, z: 22, radius: 2 }] }) });
  const town: ZoneDef = must(content.zones.get('waystation'), 'town');
  const arena: ZoneDef = must(content.zones.get('shallows'), 'arena');
  assert.equal(town.kind, 'town');
  assert.equal(town.surge, null);
  assert.equal(arena.kind, 'wild');
  assert.equal(arena.level, 1);
  assert.deepEqual(arena.surge, { delay: 5, surgesPerExtraMonster: 2, maxExtraMonsters: 3 });
  assert.deepEqual(arena.checkpoints, [{ id: 'grate', x: 28, z: 22, radius: 2, marker: null }]);
  assert.deepEqual(arena.exits[0], { id: 'east', x: 78.4, z: 30, radius: 1.6, to: 'waystation', toExit: 'west_gate', arrival: { x: 73, z: 30 }, requires: [], lockedHint: '', hiddenWhenLocked: false, look: 'ring', marker: null });
  assert.deepEqual(arena.waypoint, null);
  assert.deepEqual(town.waypoint, { ...waystation.waypoint, marker: null });
  const mist = must(must(content.zones.get('hall_of_time'), 'hall').exits.find((exit): boolean => exit.id === 'mist'), 'mist exit');
  assert.deepEqual(mist.requires, []);
  assert.equal(mist.look, 'mist');
  assert.equal(mist.hiddenWhenLocked, false);
  assert.equal(must(town.props.find((placed): boolean => placed.when.length > 0), 'conditional prop').when.length, 1);
  assert.equal(arena.ambience.background, shallows.ambience.background);
  assert.equal(arena.floors['.'], 'silt');
  assert.deepEqual(arena.outside, { ...shallows.outside, edge: null });
  assert.deepEqual(town.outside, { ...waystation.outside, edge: null, barrier: { ...waystation.outside.barrier, drop: [] } });
  assert.equal(arena.walls, null);
  assert.equal(content.world.start, 'shallows');
  assert.deepEqual(content.world.scaling, world.scaling);
  assert.deepEqual(contentProblems(content), []);
});

void test('a malformed zone is rejected: ragged tiles, a town with packs, bad exits, duplicate ids', (): void => {
  assert.throws((): Content => parseContent(withZone({ ...shallows, tiles: ['....', '..'] })), (error: unknown): boolean => problem(error, 'zones[1].tiles'));
  assert.throws((): Content => parseContent(withZone({ ...shallows, kind: 'town' })), (error: unknown): boolean => problem(error, 'a town is safe'));
  assert.throws((): Content => parseContent(withZone({ ...shallows, kind: 'swamp' })), (error: unknown): boolean => problem(error, 'zones[1].kind'));
  assert.throws((): Content => parseContent(withZone({ ...shallows, level: 0 })), (error: unknown): boolean => problem(error, 'zones[1].level'));
  const { surge: _surge, ...noSurgeKey } = shallows;
  assert.throws((): Content => parseContent(withZone(noSurgeKey)), (error: unknown): boolean => problem(error, 'zones[1].surge'));
  assert.equal(must(parseContent(withZone({ ...shallows, surge: null })).zones.get('shallows'), 'arena').surge, null);
  const stair = must(shallows.exits.find((exit): boolean => exit.id === 'east'), 'east exit');
  assert.throws((): Content => parseContent(withZone({ ...shallows, exits: [{ ...stair, radius: 0 }] })), (error: unknown): boolean => problem(error, 'exits[0].radius'));
  assert.throws((): Content => parseContent(withZone({ ...shallows, exits: [{ ...stair, arrival: 'door' }] })), (error: unknown): boolean => problem(error, 'exits[0].arrival'));
  assert.throws((): Content => parseContent(withZone({ ...shallows, exits: [stair, stair] })), (error: unknown): boolean => problem(error, 'duplicate id east'));
  assert.throws((): Content => parseContent(withZone({ ...shallows, checkpoints: [{ id: 'a', x: 1, z: 1 }] })), (error: unknown): boolean => problem(error, 'checkpoints[0].radius'));
  assert.throws((): Content => parseContent({ ...shipped, zones: zones(waystation, shallows, shallows) }), (error: unknown): boolean => problem(error, 'duplicate id shallows'));
  assert.throws((): Content => parseContent({ ...shipped, world: { start: 'waystation' } }), (error: unknown): boolean => problem(error, 'world.scaling'));
});

void test('contentProblems reports an unknown start zone and exits that lead nowhere or are not matched', (): void => {
  const stair = must(shallows.exits.find((exit): boolean => exit.id === 'east'), 'east exit');
  const lost: Content = parseContent({ ...shipped, world: { ...world, start: 'nowhere' } });
  assert.ok(contentProblems(lost).some((found: string): boolean => found.includes('unknown zone nowhere')));
  const noZone: Content = parseContent({ ...shipped, zones: zones(waystation, { ...shallows, exits: [{ ...stair, to: 'the_moon' }] }) });
  assert.ok(contentProblems(noZone).some((found: string): boolean => found.includes('unknown exit the_moon.west_gate')));
  const noExit: Content = parseContent({ ...shipped, zones: zones(waystation, { ...shallows, exits: [{ ...stair, toExit: 'trapdoor' }] }) });
  assert.ok(contentProblems(noExit).some((found: string): boolean => found.includes('unknown exit waystation.trapdoor')));
  const oneWay: Content = parseContent({ ...shipped, zones: zones(waystation, { ...shallows, exits: [{ ...stair, id: 'ladder' }] }) });
  assert.ok(contentProblems(oneWay).some((found: string): boolean => found.includes('exit ladder is not matched by waystation.west_gate')));
  const badPack: Content = parseContent({ ...shipped, zones: zones(waystation, { ...shallows, packs: [{ x: 1, z: 1, members: [{ monster: 'nobody', count: 1 }] }] }) });
  assert.ok(contentProblems(badPack).some((found: string): boolean => found.includes('zone shallows pack uses unknown monster nobody')));
});

const extraNpc = {
  id: 'pedlar',
  name: 'Pedlar',
  title: 'The Seller',
  rig: 'human_man',
  scale: 1,
  tint: '#ffffff',
  color: '#ffffff',
  gear: ['keeper_rod'],
  wear: ['linen_shirt'],
  talks: [
    { id: 'pedlar_hello', once: true, lines: ['pedlar_hello_1', 'pedlar_hello_2'] },
    { id: 'pedlar_again', once: false, lines: ['pedlar_again_1'] },
  ],
};

const extraLines = [
  { id: 'pedlar_hello_1', speaker: 'pedlar', text: 'Buy something.' },
  { id: 'pedlar_hello_2', speaker: 'pedlar', text: 'Or do not.' },
  { id: 'pedlar_again_1', speaker: 'pedlar', text: 'Still here.' },
];

function peopled(): RawContent {
  return { ...shipped, npcs: [...npcs, extraNpc], lines: [...lines, ...extraLines], zones: zones({ ...waystation, npcs: [...waystation.npcs, { npc: 'pedlar', x: 22, z: 16, facingDegrees: 90 }] }, shallows) };
}

void test('an npc, its conversations, its lines and its placement are data only', (): void => {
  const content: Content = parseContent(peopled());
  assert.deepEqual(contentProblems(content), []);
  const pedlar: NpcDef = must(content.npcs.get('pedlar'), 'pedlar');
  assert.equal(pedlar.title, 'The Seller');
  assert.deepEqual(pedlar.talks, extraNpc.talks.map((entry) => ({ ...entry, when: [] })));
  assert.deepEqual(content.lines.get('pedlar_hello_2'), { id: 'pedlar_hello_2', speaker: 'pedlar', text: 'Or do not.' });
  assert.deepEqual(must(content.zones.get('waystation'), 'town').npcs.at(-1), { npc: 'pedlar', x: 22, z: 16, facingDegrees: 90, when: [] });
  const town = worldIn(content, 'waystation', 3);
  assert.ok(town.npcs.some((npc): boolean => npc.def.id === 'pedlar' && npc.pos.x === 22 && npc.pos.z === 16));
});

void test('malformed npcs and lines are rejected', (): void => {
  const base: RawContent = peopled();
  assert.throws((): Content => parseContent({ ...base, npcs: [{ ...extraNpc, talks: [{ id: 'empty', once: false, lines: [] }] }] }), (error: unknown): boolean => problem(error, 'a conversation needs at least one line'));
  assert.throws((): Content => parseContent({ ...base, npcs: [extraNpc, { ...extraNpc, id: 'twin' }] }), (error: unknown): boolean => problem(error, 'duplicate id pedlar_hello'));
  assert.throws((): Content => parseContent({ ...base, npcs: [{ ...extraNpc, scale: 0 }] }), (error: unknown): boolean => problem(error, 'npcs[0].scale'));
  assert.throws((): Content => parseContent({ ...base, lines: [...extraLines, { id: 'pedlar_hello_1', speaker: 'pedlar', text: 'Again.' }] }), (error: unknown): boolean => problem(error, 'duplicate id pedlar_hello_1'));
  assert.throws((): Content => parseContent({ ...base, lines: [{ id: 'blank', speaker: 'pedlar', text: '  ' }] }), (error: unknown): boolean => problem(error, 'lines[0].text'));
  assert.throws((): Content => parseContent({ ...shipped, zones: zones({ ...waystation, npcs: [{ npc: 'warden_guide', x: 1 }] }, shallows) }), (error: unknown): boolean => problem(error, 'npcs[0].z'));
});

void test('contentProblems reports dangling npc references', (): void => {
  const base: RawContent = peopled();
  assert.ok(has({ ...base, npcs: [...npcs, { ...extraNpc, rig: 'no_such_rig' }] }, 'npc pedlar uses unknown rig no_such_rig'));
  assert.ok(has({ ...base, npcs: [...npcs, { ...extraNpc, gear: ['no_such_gear'] }] }, 'unknown attachment no_such_gear'));
  assert.ok(has({ ...base, npcs: [...npcs, { ...extraNpc, wear: ['no_such_coat'] }] }, 'npc pedlar wears unknown wearable no_such_coat'));
  assert.ok(has({ ...base, npcs: [...npcs, { ...extraNpc, talks: [extraNpc.talks[0]] }] }, 'npc pedlar has no repeatable conversation without conditions'));
  assert.ok(has({ ...base, npcs: [...npcs, { ...extraNpc, talks: [extraNpc.talks[1], extraNpc.talks[0]] }] }, 'conversation pedlar_hello of pedlar can never play: it comes after the repeatable conversation pedlar_again, which has no conditions'));
  const gated = { ...extraNpc.talks[1], id: 'pedlar_later', when: [{ type: 'quest', quest: 'out_of_the_mist', is: 'done' }] };
  assert.equal(has({ ...base, npcs: [...npcs, { ...extraNpc, talks: [gated, ...extraNpc.talks] }] }, 'can never play'), false);
  assert.ok(has({ ...base, lines: [...lines, ...extraLines.slice(1)] }, 'conversation pedlar_hello uses unknown line pedlar_hello_1'));
  assert.ok(has({ ...base, lines: [...lines, ...extraLines, { id: 'ghost_1', speaker: 'ghost', text: 'Boo.' }] }, 'line ghost_1 has unknown speaker ghost'));
  assert.ok(has({ ...base, npcs: [...npcs, { ...extraNpc, talks: [{ id: 'pedlar_again', once: false, lines: ['warden_guide_road'] }] }] }, 'uses line warden_guide_road, which is spoken by warden_guide'));
  assert.ok(has({ ...shipped, zones: zones({ ...waystation, npcs: [{ npc: 'nobody', x: 22, z: 16, facingDegrees: 0 }] }, shallows) }, 'zone waystation places unknown npc nobody'));
});

const extraQuest = {
  id: 'errand',
  name: 'An Errand',
  requires: ['out_of_the_mist'],
  objectives: [
    { id: 'ask', type: 'talk', npc: 'warden_guide', talk: null, text: 'Ask' },
    { id: 'go', type: 'reach', zone: 'waystation', x: 30, z: 20, radius: 1.5, text: 'Go' },
    { id: 'kill', type: 'defeat', monster: 'mender', text: 'Kill' },
  ],
};

void test('a quest, its three kinds of objective, conditions, a waypoint and map places are data only', (): void => {
  const gate = { type: 'objective', quest: 'errand', objective: 'go', is: 'done' };
  const content: Content = parseContent({ ...shipped, quests: [...quests, extraQuest], zones: zones(townWithGate({ requires: [gate, { type: 'quest', quest: 'out_of_the_mist', is: 'done', not: true }], lockedHint: 'Later' }), shallows) });
  assert.deepEqual(contentProblems(content), []);
  const errand: QuestDef = must(content.quests.get('errand'), 'errand');
  assert.deepEqual(errand.requires, ['out_of_the_mist']);
  assert.deepEqual(errand.objectives, extraQuest.objectives.map((goal: object): object => ({ ...goal, waiting: '', when: [], sets: {} })));
  const town: ZoneDef = must(content.zones.get('waystation'), 'town');
  const stair = must(town.exits.find((exit): boolean => exit.id === 'west_gate'), 'town stair');
  assert.deepEqual(stair.requires, [{ ...gate, not: false }, { type: 'quest', quest: 'out_of_the_mist', is: 'done', not: true }]);
  assert.equal(stair.lockedHint, 'Later');
  assert.deepEqual(town.waypoint, { ...waystation.waypoint, marker: null });
  assert.deepEqual(content.world.acts, world.acts.map((entry: (typeof world.acts)[number]): object => ({ ...entry, end: null, atlas: { ...entry.atlas, chains: entry.atlas.chains, places: entry.atlas.places.map((place: (typeof entry.atlas.places)[number]): object => ({ label: null, chain: null, ...place })) } })));
  const warden = must(npcs.find((entry): boolean => entry.id === 'warden_guide'), 'warden');
  const asked = { type: 'objective', quest: 'errand', objective: 'ask', is: 'current' };
  const gatedWarden = { ...warden, talks: warden.talks.map((talk, index) => (index === 0 ? { ...talk, when: [asked] } : talk)) };
  const talking: Content = parseContent({ ...shipped, quests: [...quests, extraQuest], npcs: npcs.map((entry): unknown => (entry === warden ? gatedWarden : entry)) });
  assert.deepEqual(must(must(talking.npcs.get('warden_guide'), 'warden').talks[0], 'talk').when, [{ ...asked, not: false }]);
});

void test('malformed quests, conditions and waypoints are rejected', (): void => {
  const [ask, go] = extraQuest.objectives;
  const [stair] = waystation.exits;
  assert.throws((): Content => parseContent(onlyQuest({ ...extraQuest, objectives: [{ ...ask, type: 'dance' }] })), (error: unknown): boolean => problem(error, 'objectives[0].type'));
  assert.throws((): Content => parseContent(onlyQuest({ ...extraQuest, objectives: [ask, ask] })), (error: unknown): boolean => problem(error, 'duplicate id ask'));
  assert.throws((): Content => parseContent(onlyQuest({ ...extraQuest, objectives: [] })), (error: unknown): boolean => problem(error, 'a quest needs at least one objective'));
  assert.throws((): Content => parseContent(onlyQuest({ ...extraQuest, objectives: [{ ...go, radius: 0 }] })), (error: unknown): boolean => problem(error, 'objectives[0].radius'));
  assert.throws((): Content => parseContent({ ...shipped, quests: [extraQuest, extraQuest] }), (error: unknown): boolean => problem(error, 'duplicate id errand'));
  const badState = { ...stair, requires: [{ type: 'quest', quest: 'out_of_the_mist', is: 'finished' }], lockedHint: 'No' };
  assert.throws((): Content => parseContent({ ...shipped, zones: zones({ ...waystation, exits: [badState] }, shallows) }), (error: unknown): boolean => problem(error, 'requires[0].is'));
  const noHint = { ...stair, requires: [{ type: 'quest', quest: 'out_of_the_mist', is: 'done' }], lockedHint: undefined };
  assert.throws((): Content => parseContent({ ...shipped, zones: zones({ ...waystation, exits: [noHint] }, shallows) }), (error: unknown): boolean => problem(error, 'exits[0].lockedHint'));
  const { waypoint: _waypoint, ...noWaypointKey } = shallows;
  assert.throws((): Content => parseContent(withZone(noWaypointKey)), (error: unknown): boolean => problem(error, 'zones[1].waypoint'));
  assert.equal(must(parseContent(withZone({ ...shallows, waypoint: null })).zones.get('shallows'), 'arena').waypoint, null);
  assert.throws((): Content => parseContent(withZone({ ...shallows, waypoint: { x: 1, z: 1, radius: -2 } })), (error: unknown): boolean => problem(error, 'waypoint.radius'));
  assert.throws((): Content => parseContent({ ...shipped, world: { ...world, acts: [{ ...act, atlas: { ...act.atlas, places: [{ zone: 'waystation', x: 0 }] } }] } }), (error: unknown): boolean => problem(error, 'places[0].y'));
  assert.throws((): Content => parseContent({ ...shipped, world: { ...world, acts: [act, act] } }), (error: unknown): boolean => problem(error, 'duplicate id act_1'));
  assert.throws((): Content => parseContent({ ...shipped, world: { ...world, acts: [{ ...act, atlas: { ...act.atlas, features: [{ kind: 'volcano', points: [] }] } }] } }), (error: unknown): boolean => problem(error, 'features[0]'));
});

function gatedBy(requires: unknown): RawContent {
  return { ...shipped, zones: zones(townWithGate({ requires, lockedHint: 'No' }), shallows) };
}

function drawn(change: Record<string, unknown>): RawContent {
  return { ...shipped, world: { ...world, acts: [{ ...act, atlas: { ...act.atlas, ...change } }] } };
}

void test('contentProblems reports dangling quest references', (): void => {
  const [ask, go, kill] = extraQuest.objectives;
  assert.ok(has(addedQuest({ ...extraQuest, requires: ['prologue'] }), 'quest errand requires unknown quest prologue'));
  assert.ok(has(addedQuest({ ...extraQuest, requires: ['errand'] }), 'quest errand requires unknown quest errand'));
  assert.ok(has(addedQuest({ ...extraQuest, objectives: [{ ...ask, npc: 'nobody' }] }), 'quest errand objective ask names unknown npc nobody'));
  assert.ok(has(addedQuest({ ...extraQuest, objectives: [{ ...go, zone: 'atlantis' }] }), 'quest errand objective go names unknown zone atlantis'));
  assert.ok(has(addedQuest({ ...extraQuest, objectives: [{ ...kill, monster: 'dragon' }] }), 'quest errand objective kill names unknown monster dragon'));
  assert.ok(has(gatedBy([{ type: 'quest', quest: 'prologue', is: 'done' }]), 'zone waystation exit west_gate names unknown quest prologue'));
  assert.ok(has(gatedBy([{ type: 'objective', quest: 'out_of_the_mist', objective: 'dance', is: 'done' }]), 'zone waystation exit west_gate names unknown objective out_of_the_mist.dance'));
  const [firstPlace, secondPlace] = act.atlas.places;
  const [firstRoad] = act.atlas.roads;
  assert.ok(has(drawn({ places: act.atlas.places.filter((place): boolean => place.zone !== 'shallows') }), 'zone shallows needs one place on the world map'));
  assert.ok(has(drawn({ places: [...act.atlas.places, { zone: 'atlantis', x: 4, y: 4 }] }), 'world map places unknown zone atlantis'));
  assert.ok(has(drawn({ places: [...act.atlas.places, firstPlace] }), 'act act_1 places zone shallows twice'));
  assert.ok(has(drawn({ places: [firstPlace, { ...secondPlace, x: firstPlace?.x, y: firstPlace?.y }, ...act.atlas.places.slice(2)] }), 'act act_1 puts two zones at 260,560'));
  assert.ok(has(drawn({ places: [{ ...firstPlace, x: -5 }, ...act.atlas.places.slice(1)] }), 'act act_1 places zone shallows off the map'));
  assert.ok(has(drawn({ roads: act.atlas.roads.slice(1) }), 'act act_1 draws no road from shallows to waystation'));
  assert.ok(has(drawn({ roads: [...act.atlas.roads, firstRoad] }), 'act act_1 road shallows to waystation is drawn twice'));
  assert.ok(has(drawn({ roads: [...act.atlas.roads, { from: 'waystation', to: 'between', via: [] }] }), 'act act_1 road waystation to between follows no exit'));
  assert.ok(has(drawn({ roads: [{ ...firstRoad, via: [{ x: 9000, y: 0 }] }, ...act.atlas.roads.slice(1)] }), 'act act_1 road shallows to waystation leaves the map'));
  assert.ok(has({ ...shipped, world: { ...world, acts: [] } }, 'world has no act'));
});

void test('a zone takes spoken lines tied to a place: a voice needs lines, known lines and an id of its own', (): void => {
  const until = { type: 'quest', quest: 'out_of_the_mist', is: 'done', not: true };
  const voice = { id: 'well_whisper', x: 26, z: 22, radius: 3, lines: ['pedlar_hello_1', 'pedlar_hello_2'], when: [until] };
  const { when: _when, ...always } = voice;
  const voiced = (entries: readonly unknown[]): RawContent => ({ ...peopled(), zones: zones({ ...waystation, voices: entries }, shallows) });
  const content: Content = parseContent(voiced([voice, { ...always, id: 'well_echo' }]));
  assert.deepEqual(contentProblems(content), []);
  assert.deepEqual(must(content.zones.get('waystation'), 'town').voices, [voice, { ...always, id: 'well_echo', when: [] }]);
  assert.deepEqual(must(content.zones.get('shallows'), 'arena').voices, []);
  assert.throws((): Content => parseContent(voiced([{ ...voice, lines: [] }])), (error: unknown): boolean => problem(error, 'a voice needs at least one line'));
  assert.throws((): Content => parseContent(voiced([voice, voice])), (error: unknown): boolean => problem(error, 'duplicate id well_whisper'));
  assert.throws((): Content => parseContent(voiced([{ ...voice, radius: 0 }])), (error: unknown): boolean => problem(error, 'voices[0].radius'));
  assert.ok(has(voiced([{ ...voice, lines: ['no_such_line'] }]), 'zone waystation voice well_whisper uses unknown line no_such_line'));
  assert.ok(has(voiced([{ ...voice, when: [{ type: 'quest', quest: 'no_such_quest', is: 'done' }] }]), 'zone waystation voice well_whisper names unknown quest no_such_quest'));
  assert.ok(has(voiced([{ ...voice, id: 'pedlar_hello' }]), 'zone waystation voice pedlar_hello shares its id with a conversation'));
  const echoed: RawContent = { ...peopled(), zones: zones({ ...waystation, voices: [voice] }, { ...shallows, voices: [{ ...voice, x: 28, z: 30 }] }) };
  assert.ok(has(echoed, 'voice well_whisper shares its id with a voice in zone'));
});

function voidWith(change: Readonly<Record<string, unknown>>): RawContent {
  const changed: unknown = { ...between, ...change };
  return { ...shipped, zones: shipped.zones.map((entry: unknown): unknown => (entry === between ? changed : entry)) };
}

void test('a void recentres around the hero, so it cannot hold npcs, checkpoints or a waypoint', (): void => {
  const checkpoint = { id: 'stone', x: 80, z: 80, radius: 2 };
  assert.throws((): unknown => parseContent(voidWith({ checkpoints: [checkpoint] })), (error: unknown): boolean => problem(error, 'cannot hold npcs, checkpoints or props'));
  assert.throws((): unknown => parseContent(voidWith({ props: [{ prop: 'castle_pier', x: 80, z: 80 }] })), (error: unknown): boolean => problem(error, 'or props'));
  assert.throws((): unknown => parseContent(voidWith({ scatter: [{ type: 'open', props: ['rubble_chip'], count: 4, clump: 1, spread: 0, size: { least: 1, most: 1 }, clear: 0 }] })), (error: unknown): boolean => problem(error, 'or props'));
  assert.throws((): unknown => parseContent(voidWith({ waypoint: { x: 80, z: 80 } })), (error: unknown): boolean => problem(error, 'cannot hold a waypoint'));
  assert.doesNotThrow((): unknown => parseContent(voidWith({})));
});

void test('a zone may name the smaller size it grew from, which must fit inside its tiles in whole tiles', (): void => {
  const columns: number = hall.tiles[0]?.length ?? 0;
  assert.equal(parsed({}).grewFrom, null);
  assert.deepEqual(parsed({ grewFrom: { columns: columns - 2, rows: 3 } }).grewFrom, { columns: columns - 2, rows: 3 });
  assert.throws((): ZoneDef => parsed({ grewFrom: { columns: columns + 1, rows: 3 } }), /only grows/);
  assert.throws((): ZoneDef => parsed({ grewFrom: { columns: 2.5, rows: 3 } }), /whole tile/);
});
