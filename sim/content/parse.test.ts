import assert from 'node:assert/strict';
import { test } from 'node:test';
import attachments from '../../data/attachments.json' with { type: 'json' };
import items from '../../data/items.json' with { type: 'json' };
import lines from '../../data/lines.json' with { type: 'json' };
import monsters from '../../data/monsters.json' with { type: 'json' };
import npcs from '../../data/npcs.json' with { type: 'json' };
import player from '../../data/player.json' with { type: 'json' };
import quests from '../../data/quests.json' with { type: 'json' };
import props from '../../data/props.json' with { type: 'json' };
import rigs from '../../data/rigs.json' with { type: 'json' };
import skillTree from '../../data/skill-tree.json' with { type: 'json' };
import skills from '../../data/skills.json' with { type: 'json' };
import wearables from '../../data/wearables.json' with { type: 'json' };
import world from '../../data/world.json' with { type: 'json' };
import bastion from '../../data/zones/drowned_bastion.json' with { type: 'json' };
import stillhold from '../../data/zones/stillhold.json' with { type: 'json' };
import { must, worldIn } from '../../test/support.ts';
import { generateItem } from '../items.ts';
import { createRng } from '../rng.ts';
import { canAllocate } from '../progression.ts';
import { contentProblems, parseContent } from './parse.ts';
import type { RawContent } from './parse.ts';
import { ContentError } from './read.ts';
import type { Content, MonsterDef, NpcDef, QuestDef, ZoneDef } from './types.ts';

const shipped: RawContent = { skills, monsters, items, skillTree, rigs, attachments, wearables, props, zones: [stillhold, bastion], world, npcs, lines, quests, player };

const extraSkill = {
  id: 'ember_lash',
  name: 'Ember Lash',
  description: 'A whip of embers.',
  icon: 'cleave',
  animation: 'attack',
  manaCost: 0,
  cooldown: 0.8,
  windup: 0.3,
  recovery: 0.3,
  scalesWithAttackSpeed: false,
  engageRange: 2.5,
  delivery: { type: 'arc', reach: 2.8, arcDegrees: 60 },
  damage: { weaponPercent: 1, flatMin: 0, flatMax: 0 },
  knockback: 3,
  stagger: 0,
  shake: 0.2,
  hitStop: 0,
  vfx: { style: 'slash', color: '#ff8844' },
};

const extraMonster = {
  id: 'ash_wraith',
  name: 'Ash Wraith',
  rig: 'skeleton_thrall',
  scale: 1.2,
  radius: 0.5,
  life: 45,
  damageMin: 5,
  damageMax: 8,
  moveSpeed: 4.4,
  xp: 14,
  aggroRadius: 10,
  behaviour: { type: 'chaser' },
  skill: 'ember_lash',
  loot: { goldChance: 0.5, goldMin: 1, goldMax: 3, itemChance: 0.1 },
  color: '#ff8844',
  tint: '#553322',
  gear: ['ash_brand'],
  wear: ['ash_shroud'],
};

const extraWearable = { id: 'ash_shroud', model: 'models/wear/peasant_shirt.glb', region: 'chest', tint: '#33302c', hides: [] };

const extraAttachment = { id: 'ash_brand', model: 'models/weapons/rusted_blade.glb', socket: 'hand_l' };

const extraBase = {
  id: 'obsidian_blade',
  name: 'Obsidian Blade',
  slot: 'weapon',
  material: null,
  icon: 'sword',
  dropWeight: 5,
  minLevel: 1,
  visual: 'sword_1h',
  wear: [],
  implicit: [
    { stat: 'damageMin', op: 'add', value: 7 },
    { stat: 'damageMax', op: 'add', value: 11 },
  ],
};

const extraNode = {
  id: 'ember_heart',
  name: 'Ember Heart',
  description: '+10 Maximum Life.',
  icon: 'life',
  column: 3,
  row: 3,
  requires: ['eye_of_the_storm'],
  requireMode: 'all',
  statMods: [{ stat: 'maxLife', op: 'add', value: 10 }],
  skillMods: [],
};

function extended(): RawContent {
  return {
    ...shipped,
    skills: [...skills, extraSkill],
    monsters: [...monsters, extraMonster],
    attachments: [...attachments, extraAttachment],
    wearables: [...wearables, extraWearable],
    items: { ...items, bases: [...items.bases, extraBase] },
    skillTree: [...skillTree, extraNode],
    zones: [stillhold, { ...bastion, packs: [...bastion.packs, { x: 28, z: 22, members: [{ monster: 'ash_wraith', count: 3 }] }] }],
  };
}

function has(raw: RawContent, text: string): boolean {
  return contentProblems(parseContent(raw)).some((found: string): boolean => found.includes(text));
}

function onlyQuest(quest: unknown): RawContent {
  return { ...shipped, quests: [quest] };
}

function addedQuest(quest: unknown): RawContent {
  return { ...shipped, quests: [...quests, quest] };
}

function withZone(zone: unknown): RawContent {
  return { ...shipped, zones: [stillhold, zone] };
}

function problem(error: unknown, text: string): boolean {
  return error instanceof ContentError && error.message.includes(text);
}

void test('a wrong field type throws a ContentError naming the field', (): void => {
  const broken: RawContent = { ...shipped, monsters: [{ ...must(monsters[0], 'monster'), life: 'lots' }] };
  assert.throws((): Content => parseContent(broken), (error: unknown): boolean => problem(error, 'monsters[0].life'));
});

void test('a missing field throws a ContentError naming the field', (): void => {
  const { damage: _damage, ...incomplete } = must(skills[1], 'skill');
  const broken: RawContent = { ...shipped, skills: [incomplete] };
  assert.throws((): Content => parseContent(broken), (error: unknown): boolean => problem(error, 'skills[0].damage'));
  const noRarities: RawContent = { ...shipped, items: { scaling: items.scaling, bases: [], affixes: [] } };
  assert.throws((): Content => parseContent(noRarities), (error: unknown): boolean => problem(error, 'items.rarities'));
});

void test('an unknown enum value and a duplicate id are rejected', (): void => {
  const badBehaviour: RawContent = { ...shipped, monsters: [{ ...extraMonster, behaviour: { type: 'dancer' } }] };
  assert.throws((): Content => parseContent(badBehaviour), (error: unknown): boolean => problem(error, 'behaviour.type'));
  const duplicate: RawContent = { ...shipped, attachments: [...attachments, extraAttachment], wearables: [...wearables, extraWearable], monsters: [extraMonster, extraMonster] };
  assert.throws((): Content => parseContent(duplicate), (error: unknown): boolean => problem(error, 'duplicate id ash_wraith'));
});

void test('contentProblems reports dangling references', (): void => {
  const content: Content = parseContent({ ...shipped, attachments: [...attachments, extraAttachment], wearables: [...wearables, extraWearable], monsters: [...monsters, { ...extraMonster, skill: 'no_such_skill', rig: 'no_such_rig' }] });
  const problems: string[] = contentProblems(content);
  assert.ok(problems.some((line: string): boolean => line.includes('ash_wraith') && line.includes('no_such_skill')));
  assert.ok(problems.some((line: string): boolean => line.includes('ash_wraith') && line.includes('no_such_rig')));
  const danglingNode: Content = parseContent({ ...shipped, skillTree: [...skillTree, { ...extraNode, requires: ['nothing'] }] });
  assert.ok(contentProblems(danglingNode).some((line: string): boolean => line.includes('nothing')));
});

void test('a new skill, monster, item base and tree node are data only', (): void => {
  const content: Content = parseContent(extended());
  assert.deepEqual(contentProblems(content), []);
  const wraith: MonsterDef = must(content.monsters.get('ash_wraith'), 'ash_wraith');
  assert.equal(wraith.skill, 'ember_lash');

  const arena = worldIn(content, 'drowned_bastion', 7);
  const spawned = arena.monsters.filter((monster): boolean => monster.def.id === 'ash_wraith');
  assert.equal(spawned.length, 3);
  assert.ok(spawned.every((monster): boolean => monster.life === 45));

  const item = must(generateItem(content, createRng(3), 1, 1, 'obsidian_blade', 'common'), 'item');
  assert.equal(item.base, 'obsidian_blade');

  assert.equal(canAllocate(content, ['eye_of_the_storm'], 1, 'ember_heart'), true);
  assert.equal(canAllocate(content, [], 1, 'ember_heart'), false);
});

void test('held gear is data: a missing attachment or socket is reported', (): void => {
  const geared: RawContent = { ...shipped, skills: [...skills, extraSkill], attachments: [...attachments, extraAttachment], wearables: [...wearables, extraWearable], monsters: [...monsters, extraMonster] };
  const withGear: Content = parseContent(geared);
  assert.deepEqual(contentProblems(withGear), []);
  assert.deepEqual(must(withGear.monsters.get('ash_wraith'), 'ash_wraith').gear, ['ash_brand']);

  const unknownAttachment: Content = parseContent({ ...geared, attachments });
  assert.ok(contentProblems(unknownAttachment).some((found: string): boolean => found.includes('unknown attachment ash_brand')));

  const noSocket: Content = parseContent({ ...geared, attachments: [...attachments, { ...extraAttachment, socket: 'tail' }] });
  assert.ok(contentProblems(noSocket).some((found: string): boolean => found.includes('no socket tail')));

  const badVisual: Content = parseContent({ ...shipped, items: { ...items, bases: [...items.bases, { ...items.bases[0], id: 'ghost_blade', visual: 'no_such_model' }] } });
  assert.ok(contentProblems(badVisual).some((found: string): boolean => found.includes('item ghost_blade uses unknown attachment no_such_model')));
});

void test('worn gear is data: unknown wearables, doubled regions and unknown body parts are reported', (): void => {
  const dressed: RawContent = { ...shipped, skills: [...skills, extraSkill], attachments: [...attachments, extraAttachment], wearables: [...wearables, extraWearable], monsters: [...monsters, extraMonster] };
  const withWear: Content = parseContent(dressed);
  assert.deepEqual(contentProblems(withWear), []);
  assert.deepEqual(must(withWear.monsters.get('ash_wraith'), 'ash_wraith').wear, ['ash_shroud']);
  assert.equal(must(withWear.wearables.get('ash_shroud'), 'ash_shroud').region, 'chest');

  const unknownWearable: Content = parseContent({ ...dressed, wearables });
  assert.ok(contentProblems(unknownWearable).some((found: string): boolean => found.includes('monster ash_wraith wears unknown wearable ash_shroud')));

  const badRegion: RawContent = { ...shipped, wearables: [...wearables, { ...extraWearable, region: 'tail' }] };
  assert.throws((): Content => parseContent(badRegion), (error: unknown): boolean => problem(error, 'region'));

  const doubled: Content = parseContent({ ...shipped, wearables: [...wearables, extraWearable], player: { ...player, wear: ['dirty_shirt', 'ash_shroud'] } });
  assert.ok(contentProblems(doubled).some((found: string): boolean => found.includes('player wears two pieces on its chest')));

  const hidesNothing: Content = parseContent({ ...shipped, wearables: [...wearables, { ...extraWearable, hides: ['tail'] }] });
  assert.ok(contentProblems(hidesNothing).some((found: string): boolean => found.includes('wearable ash_shroud') && found.includes('no body part tail')));

  const badItem: Content = parseContent({ ...shipped, items: { ...items, bases: [...items.bases, { ...extraBase, id: 'ghost_coat', slot: 'chest', material: 'cloth', visual: null, wear: ['no_such_coat'] }] } });
  assert.ok(contentProblems(badItem).some((found: string): boolean => found.includes('item ghost_coat wears unknown wearable no_such_coat')));

  const bareCoat: Content = parseContent({ ...shipped, items: { ...items, bases: [...items.bases, { ...extraBase, id: 'bare_coat', slot: 'chest', visual: null }] } });
  assert.ok(contentProblems(bareCoat).some((found: string): boolean => found.includes('item bare_coat in slot chest needs a material')));
  const plateSword: Content = parseContent({ ...shipped, items: { ...items, bases: [...items.bases, { ...extraBase, material: 'plate' }] } });
  assert.ok(contentProblems(plateSword).some((found: string): boolean => found.includes('item obsidian_blade in slot weapon cannot have a material')));
  const oddCloth: RawContent = { ...shipped, items: { ...items, bases: [...items.bases, { ...extraBase, material: 'silk' }] } };
  assert.throws((): Content => parseContent(oddCloth), (error: unknown): boolean => problem(error, 'material'));
});

void test('a zone parses with its kind, level, exits, checkpoints, surge rules and ambience', (): void => {
  const content: Content = parseContent({ ...shipped, zones: [stillhold, { ...bastion, checkpoints: [{ id: 'grate', x: 28, z: 22, radius: 2 }] }] });
  const town: ZoneDef = must(content.zones.get('stillhold'), 'town');
  const arena: ZoneDef = must(content.zones.get('drowned_bastion'), 'arena');
  assert.equal(town.kind, 'town');
  assert.equal(town.surge, null);
  assert.equal(arena.kind, 'wild');
  assert.equal(arena.level, 1);
  assert.deepEqual(arena.surge, { delay: 5, surgesPerExtraMonster: 2, maxExtraMonsters: 3 });
  assert.deepEqual(arena.checkpoints, [{ id: 'grate', x: 28, z: 22, radius: 2 }]);
  assert.deepEqual(arena.exits, [{ id: 'stair', x: 28, z: 41.6, radius: 1.5, to: 'stillhold', toExit: 'bastion_stair', arrival: { x: 28, z: 37 }, requires: [], lockedHint: '' }]);
  assert.deepEqual(arena.waypoint, { x: 21, z: 37.5, radius: 1.8 });
  assert.deepEqual(must(town.exits[0], 'town exit').requires, [{ type: 'objective', quest: 'fallen_in', objective: 'tallier', is: 'done' }]);
  assert.equal(must(town.exits[0], 'town exit').lockedHint, 'The Tallier is calling you over');
  assert.equal(arena.ambience.background, '#06090f');
  assert.equal(content.world.start, 'stillhold');
  assert.deepEqual(content.world.scaling, { lifePerLevel: 0.22, damagePerLevel: 0.12, xpPerLevel: 0.15 });
  assert.deepEqual(contentProblems(content), []);
});

void test('a malformed zone is rejected: ragged tiles, a town with packs, bad exits, duplicate ids', (): void => {
  assert.throws((): Content => parseContent(withZone({ ...bastion, tiles: ['....', '..'] })), (error: unknown): boolean => problem(error, 'zones[1].tiles'));
  assert.throws((): Content => parseContent(withZone({ ...bastion, kind: 'town' })), (error: unknown): boolean => problem(error, 'a town is safe'));
  assert.throws((): Content => parseContent(withZone({ ...bastion, kind: 'swamp' })), (error: unknown): boolean => problem(error, 'zones[1].kind'));
  assert.throws((): Content => parseContent(withZone({ ...bastion, level: 0 })), (error: unknown): boolean => problem(error, 'zones[1].level'));
  const { surge: _surge, ...noSurgeKey } = bastion;
  assert.throws((): Content => parseContent(withZone(noSurgeKey)), (error: unknown): boolean => problem(error, 'zones[1].surge'));
  assert.equal(must(parseContent(withZone({ ...bastion, surge: null })).zones.get('drowned_bastion'), 'arena').surge, null);
  const [stair] = bastion.exits;
  assert.throws((): Content => parseContent(withZone({ ...bastion, exits: [{ ...stair, radius: 0 }] })), (error: unknown): boolean => problem(error, 'exits[0].radius'));
  assert.throws((): Content => parseContent(withZone({ ...bastion, exits: [{ ...stair, arrival: 'door' }] })), (error: unknown): boolean => problem(error, 'exits[0].arrival'));
  assert.throws((): Content => parseContent(withZone({ ...bastion, exits: [stair, stair] })), (error: unknown): boolean => problem(error, 'duplicate id stair'));
  assert.throws((): Content => parseContent(withZone({ ...bastion, checkpoints: [{ id: 'a', x: 1, z: 1 }] })), (error: unknown): boolean => problem(error, 'checkpoints[0].radius'));
  assert.throws((): Content => parseContent({ ...shipped, zones: [stillhold, bastion, bastion] }), (error: unknown): boolean => problem(error, 'duplicate id drowned_bastion'));
  assert.throws((): Content => parseContent({ ...shipped, world: { start: 'stillhold' } }), (error: unknown): boolean => problem(error, 'world.scaling'));
});

void test('contentProblems reports an unknown start zone and exits that lead nowhere or are not matched', (): void => {
  const [stair] = bastion.exits;
  const lost: Content = parseContent({ ...shipped, world: { ...world, start: 'nowhere' } });
  assert.ok(contentProblems(lost).some((found: string): boolean => found.includes('unknown zone nowhere')));
  const noZone: Content = parseContent({ ...shipped, zones: [stillhold, { ...bastion, exits: [{ ...stair, to: 'the_moon' }] }] });
  assert.ok(contentProblems(noZone).some((found: string): boolean => found.includes('unknown exit the_moon.bastion_stair')));
  const noExit: Content = parseContent({ ...shipped, zones: [stillhold, { ...bastion, exits: [{ ...stair, toExit: 'trapdoor' }] }] });
  assert.ok(contentProblems(noExit).some((found: string): boolean => found.includes('unknown exit stillhold.trapdoor')));
  const oneWay: Content = parseContent({ ...shipped, zones: [stillhold, { ...bastion, exits: [{ ...stair, id: 'ladder' }] }] });
  assert.ok(contentProblems(oneWay).some((found: string): boolean => found.includes('exit ladder is not matched by stillhold.bastion_stair')));
  const badPack: Content = parseContent({ ...shipped, zones: [stillhold, { ...bastion, packs: [{ x: 1, z: 1, members: [{ monster: 'nobody', count: 1 }] }] }] });
  assert.ok(contentProblems(badPack).some((found: string): boolean => found.includes('zone drowned_bastion pack uses unknown monster nobody')));
});

const extraNpc = {
  id: 'pedlar',
  name: 'Pedlar',
  title: 'The Seller',
  rig: 'skeleton_townsfolk',
  scale: 1,
  tint: '#ffffff',
  color: '#ffffff',
  gear: ['hex_staff'],
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
  return { ...shipped, npcs: [...npcs, extraNpc], lines: [...lines, ...extraLines], zones: [{ ...stillhold, npcs: [...stillhold.npcs, { npc: 'pedlar', x: 22, z: 16, facingDegrees: 90 }] }, bastion] };
}

void test('an npc, its conversations, its lines and its placement are data only', (): void => {
  const content: Content = parseContent(peopled());
  assert.deepEqual(contentProblems(content), []);
  const pedlar: NpcDef = must(content.npcs.get('pedlar'), 'pedlar');
  assert.equal(pedlar.title, 'The Seller');
  assert.deepEqual(pedlar.talks, extraNpc.talks.map((entry) => ({ ...entry, when: [] })));
  assert.deepEqual(content.lines.get('pedlar_hello_2'), { id: 'pedlar_hello_2', speaker: 'pedlar', text: 'Or do not.' });
  assert.deepEqual(must(content.zones.get('stillhold'), 'town').npcs.at(-1), { npc: 'pedlar', x: 22, z: 16, facingDegrees: 90, when: [] });
  const town = worldIn(content, 'stillhold', 3);
  assert.ok(town.npcs.some((npc): boolean => npc.def.id === 'pedlar' && npc.pos.x === 22 && npc.pos.z === 16));
});

void test('malformed npcs and lines are rejected', (): void => {
  const base: RawContent = peopled();
  assert.throws((): Content => parseContent({ ...base, npcs: [{ ...extraNpc, talks: [{ id: 'empty', once: false, lines: [] }] }] }), (error: unknown): boolean => problem(error, 'a conversation needs at least one line'));
  assert.throws((): Content => parseContent({ ...base, npcs: [extraNpc, { ...extraNpc, id: 'twin' }] }), (error: unknown): boolean => problem(error, 'duplicate id pedlar_hello'));
  assert.throws((): Content => parseContent({ ...base, npcs: [{ ...extraNpc, scale: 0 }] }), (error: unknown): boolean => problem(error, 'npcs[0].scale'));
  assert.throws((): Content => parseContent({ ...base, lines: [...extraLines, { id: 'pedlar_hello_1', speaker: 'pedlar', text: 'Again.' }] }), (error: unknown): boolean => problem(error, 'duplicate id pedlar_hello_1'));
  assert.throws((): Content => parseContent({ ...base, lines: [{ id: 'blank', speaker: 'pedlar', text: '  ' }] }), (error: unknown): boolean => problem(error, 'lines[0].text'));
  assert.throws((): Content => parseContent({ ...shipped, zones: [{ ...stillhold, npcs: [{ npc: 'maren', x: 1 }] }, bastion] }), (error: unknown): boolean => problem(error, 'npcs[0].z'));
});

void test('contentProblems reports dangling npc references', (): void => {
  const base: RawContent = peopled();
  assert.ok(has({ ...base, npcs: [...npcs, { ...extraNpc, rig: 'no_such_rig' }] }, 'npc pedlar uses unknown rig no_such_rig'));
  assert.ok(has({ ...base, npcs: [...npcs, { ...extraNpc, gear: ['no_such_gear'] }] }, 'unknown attachment no_such_gear'));
  assert.ok(has({ ...base, npcs: [...npcs, { ...extraNpc, wear: ['no_such_coat'] }] }, 'npc pedlar wears unknown wearable no_such_coat'));
  assert.ok(has({ ...base, npcs: [...npcs, { ...extraNpc, talks: [extraNpc.talks[0]] }] }, 'npc pedlar has no repeatable conversation without conditions'));
  assert.ok(has({ ...base, npcs: [...npcs, { ...extraNpc, talks: [extraNpc.talks[1], extraNpc.talks[0]] }] }, 'conversation pedlar_hello of pedlar can never play: it comes after the repeatable conversation pedlar_again, which has no conditions'));
  const gated = { ...extraNpc.talks[1], id: 'pedlar_later', when: [{ type: 'quest', quest: 'fallen_in', is: 'done' }] };
  assert.equal(has({ ...base, npcs: [...npcs, { ...extraNpc, talks: [gated, ...extraNpc.talks] }] }, 'can never play'), false);
  assert.ok(has({ ...base, lines: [...lines, ...extraLines.slice(1)] }, 'conversation pedlar_hello uses unknown line pedlar_hello_1'));
  assert.ok(has({ ...base, lines: [...lines, ...extraLines, { id: 'ghost_1', speaker: 'ghost', text: 'Boo.' }] }, 'line ghost_1 has unknown speaker ghost'));
  assert.ok(has({ ...base, npcs: [...npcs, { ...extraNpc, talks: [{ id: 'pedlar_again', once: false, lines: ['maren_idle_1'] }] }] }, 'uses line maren_idle_1, which is spoken by maren'));
  assert.ok(has({ ...shipped, zones: [{ ...stillhold, npcs: [{ npc: 'nobody', x: 22, z: 16, facingDegrees: 0 }] }, bastion] }, 'zone stillhold places unknown npc nobody'));
});

const extraQuest = {
  id: 'errand',
  name: 'An Errand',
  requires: ['fallen_in'],
  objectives: [
    { id: 'ask', type: 'talk', npc: 'maren', text: 'Ask' },
    { id: 'go', type: 'reach', zone: 'stillhold', x: 30, z: 20, radius: 1.5, text: 'Go' },
    { id: 'kill', type: 'defeat', monster: 'hex_caller', text: 'Kill' },
  ],
};

void test('a quest, its three kinds of objective, conditions, a waypoint and map places are data only', (): void => {
  const gate = { type: 'objective', quest: 'errand', objective: 'go', is: 'done' };
  const [stair] = stillhold.exits;
  const content: Content = parseContent({ ...shipped, quests: [...quests, extraQuest], zones: [{ ...stillhold, exits: [{ ...stair, requires: [gate, { type: 'quest', quest: 'fallen_in', is: 'done' }], lockedHint: 'Later' }] }, bastion] });
  assert.deepEqual(contentProblems(content), []);
  const errand: QuestDef = must(content.quests.get('errand'), 'errand');
  assert.deepEqual(errand.requires, ['fallen_in']);
  assert.deepEqual(errand.objectives, extraQuest.objectives);
  const town: ZoneDef = must(content.zones.get('stillhold'), 'town');
  assert.deepEqual(must(town.exits[0], 'exit').requires, [gate, { type: 'quest', quest: 'fallen_in', is: 'done' }]);
  assert.equal(must(town.exits[0], 'exit').lockedHint, 'Later');
  assert.deepEqual(town.waypoint, stillhold.waypoint);
  assert.deepEqual(content.world.map, world.map);
  assert.deepEqual(must(must(content.npcs.get('maren'), 'maren').talks[0], 'talk').when, [{ type: 'objective', quest: 'fallen_in', objective: 'tallier', is: 'current' }]);
});

void test('malformed quests, conditions and waypoints are rejected', (): void => {
  const [ask, go] = extraQuest.objectives;
  const [stair] = stillhold.exits;
  assert.throws((): Content => parseContent(onlyQuest({ ...extraQuest, objectives: [{ ...ask, type: 'dance' }] })), (error: unknown): boolean => problem(error, 'objectives[0].type'));
  assert.throws((): Content => parseContent(onlyQuest({ ...extraQuest, objectives: [ask, ask] })), (error: unknown): boolean => problem(error, 'duplicate id ask'));
  assert.throws((): Content => parseContent(onlyQuest({ ...extraQuest, objectives: [] })), (error: unknown): boolean => problem(error, 'a quest needs at least one objective'));
  assert.throws((): Content => parseContent(onlyQuest({ ...extraQuest, objectives: [{ ...go, radius: 0 }] })), (error: unknown): boolean => problem(error, 'objectives[0].radius'));
  assert.throws((): Content => parseContent({ ...shipped, quests: [extraQuest, extraQuest] }), (error: unknown): boolean => problem(error, 'duplicate id errand'));
  const badState = { ...stair, requires: [{ type: 'quest', quest: 'fallen_in', is: 'finished' }], lockedHint: 'No' };
  assert.throws((): Content => parseContent({ ...shipped, zones: [{ ...stillhold, exits: [badState] }, bastion] }), (error: unknown): boolean => problem(error, 'requires[0].is'));
  const noHint = { ...stair, requires: [{ type: 'quest', quest: 'fallen_in', is: 'done' }], lockedHint: undefined };
  assert.throws((): Content => parseContent({ ...shipped, zones: [{ ...stillhold, exits: [noHint] }, bastion] }), (error: unknown): boolean => problem(error, 'exits[0].lockedHint'));
  const { waypoint: _waypoint, ...noWaypointKey } = bastion;
  assert.throws((): Content => parseContent(withZone(noWaypointKey)), (error: unknown): boolean => problem(error, 'zones[1].waypoint'));
  assert.equal(must(parseContent(withZone({ ...bastion, waypoint: null })).zones.get('drowned_bastion'), 'arena').waypoint, null);
  assert.throws((): Content => parseContent(withZone({ ...bastion, waypoint: { x: 1, z: 1, radius: -2 } })), (error: unknown): boolean => problem(error, 'waypoint.radius'));
  assert.throws((): Content => parseContent({ ...shipped, world: { ...world, map: [{ zone: 'stillhold', x: 0 }] } }), (error: unknown): boolean => problem(error, 'map[0].y'));
});

void test('contentProblems reports dangling quest references', (): void => {
  const [ask, go, kill] = extraQuest.objectives;
  assert.ok(has(addedQuest({ ...extraQuest, requires: ['prologue'] }), 'quest errand requires unknown quest prologue'));
  assert.ok(has(addedQuest({ ...extraQuest, requires: ['errand'] }), 'quest errand requires unknown quest errand'));
  assert.ok(has(addedQuest({ ...extraQuest, objectives: [{ ...ask, npc: 'nobody' }] }), 'quest errand objective ask names unknown npc nobody'));
  assert.ok(has(addedQuest({ ...extraQuest, objectives: [{ ...go, zone: 'atlantis' }] }), 'quest errand objective go names unknown zone atlantis'));
  assert.ok(has(addedQuest({ ...extraQuest, objectives: [{ ...kill, monster: 'dragon' }] }), 'quest errand objective kill names unknown monster dragon'));
  const [stair] = stillhold.exits;
  const gated = (requires: unknown): RawContent => ({ ...shipped, zones: [{ ...stillhold, exits: [{ ...stair, requires, lockedHint: 'No' }] }, bastion] });
  assert.ok(has(gated([{ type: 'quest', quest: 'prologue', is: 'done' }]), 'zone stillhold exit bastion_stair names unknown quest prologue'));
  assert.ok(has(gated([{ type: 'objective', quest: 'fallen_in', objective: 'dance', is: 'done' }]), 'zone stillhold exit bastion_stair names unknown objective fallen_in.dance'));
  assert.ok(has({ ...shipped, world: { ...world, map: [world.map[0]] } }, 'zone drowned_bastion has no place on the world map'));
  assert.ok(has({ ...shipped, world: { ...world, map: [...world.map, { zone: 'atlantis', x: 4, y: 4 }] } }, 'world map places unknown zone atlantis'));
});
