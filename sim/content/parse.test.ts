import assert from 'node:assert/strict';
import { test } from 'node:test';
import attachments from '../../data/attachments.json' with { type: 'json' };
import items from '../../data/items.json' with { type: 'json' };
import lines from '../../data/lines.json' with { type: 'json' };
import monsters from '../../data/monsters.json' with { type: 'json' };
import npcs from '../../data/npcs.json' with { type: 'json' };
import player from '../../data/player.json' with { type: 'json' };
import quests from '../../data/quests.json' with { type: 'json' };
import rigs from '../../data/rigs.json' with { type: 'json' };
import skillTree from '../../data/skill-tree.json' with { type: 'json' };
import skills from '../../data/skills.json' with { type: 'json' };
import wearables from '../../data/wearables.json' with { type: 'json' };
import between from '../../data/zones/between.json' with { type: 'json' };
import { PAIR_WORLD as world, SHALLOWS as shallows, WAYSTATION as waystation } from '../../test/pair-support.ts';
import { must, worldIn } from '../../test/support.ts';
import { generateItem } from '../items.ts';
import { createRng } from '../rng.ts';
import { canAllocate } from '../progression.ts';
import { RAW_CONTENT } from './content.ts';
import { contentProblems, parseContent } from './parse.ts';
import type { RawContent } from './parse.ts';
import { ContentError } from './read.ts';
import type { BossDef, Content, MonsterDef, NpcDef, QuestDef, ZoneDef } from './types.ts';

const others: readonly unknown[] = RAW_CONTENT.zones.filter((zone: unknown): boolean => zone !== waystation && zone !== shallows);

function zones(...mine: readonly unknown[]): unknown[] {
  return [...mine, ...others];
}

const extraFaction = { id: 'ashen', name: 'The Ashen', description: 'Test people.', palette: { tints: ['#553322'], glow: '#ff8844' }, wearables: ['ash_shroud'], weapons: ['ash_brand'], regards: { player: 'hostile' } };

const shipped: RawContent = { ...RAW_CONTENT, zones: zones(waystation, shallows), world };

const shippedFactions: readonly unknown[] = Array.isArray(RAW_CONTENT.factions) ? RAW_CONTENT.factions : [];
const ashen: readonly unknown[] = [...shippedFactions, extraFaction];
const act = must(world.acts[0], 'first act');
const propDefs: readonly unknown[] = Array.isArray(RAW_CONTENT.props) ? RAW_CONTENT.props : [];

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
  rig: 'human_man',
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
  faction: 'ashen',
};

const extraWearable = { id: 'ash_shroud', model: 'models/wear/wool_tunic.glb', region: 'chest', tint: '#33302c', hides: [] };

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
  icon: 'tempered_body',
  kind: 'minor',
  path: 'storm',
  column: 0,
  row: -15.2,
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
    factions: ashen,
    attachments: [...attachments, extraAttachment],
    wearables: [...wearables, extraWearable],
    items: { ...items, bases: [...items.bases, extraBase] },
    skillTree: [...skillTree, extraNode],
    zones: zones(waystation, { ...shallows, packs: [...shallows.packs, { x: 28, z: 22, members: [{ monster: 'ash_wraith', count: 3 }] }] }),
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

function townWithGate(change: Readonly<Record<string, unknown>>): unknown {
  return { ...waystation, exits: waystation.exits.map((exit): unknown => (exit.id === 'west_gate' ? { ...exit, ...change } : exit)) };
}

function withZone(zone: unknown): RawContent {
  return { ...shipped, zones: zones(waystation, zone) };
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

void test('a dash whose invulnerable window is negative or longer than its duration is rejected', (): void => {
  const index: number = skills.findIndex((entry): boolean => entry.id === 'dodge_roll');
  const roll = must(skills[index], 'dodge_roll');
  for (const invulnerable of [-0.1, roll.windup + 0.1]) {
    const broken: RawContent = { ...shipped, skills: skills.map((entry, at: number) => (at === index ? { ...roll, delivery: { ...roll.delivery, invulnerable } } : entry)) };
    assert.throws((): Content => parseContent(broken), (error: unknown): boolean => problem(error, `skills[${index}].delivery.invulnerable`));
  }
});

void test('an unknown enum value and a duplicate id are rejected', (): void => {
  const badBehaviour: RawContent = { ...shipped, monsters: [{ ...extraMonster, behaviour: { type: 'dancer' } }] };
  assert.throws((): Content => parseContent(badBehaviour), (error: unknown): boolean => problem(error, 'behaviour.type'));
  const duplicate: RawContent = { ...shipped, attachments: [...attachments, extraAttachment], wearables: [...wearables, extraWearable], monsters: [extraMonster, extraMonster] };
  assert.throws((): Content => parseContent(duplicate), (error: unknown): boolean => problem(error, 'duplicate id ash_wraith'));
});

void test('contentProblems reports dangling references', (): void => {
  const content: Content = parseContent({ ...shipped, attachments: [...attachments, extraAttachment], wearables: [...wearables, extraWearable], factions: ashen, monsters: [...monsters, { ...extraMonster, skill: 'no_such_skill', rig: 'no_such_rig' }] });
  const problems: string[] = contentProblems(content);
  assert.ok(problems.some((line: string): boolean => line.includes('ash_wraith') && line.includes('no_such_skill')));
  assert.ok(problems.some((line: string): boolean => line.includes('ash_wraith') && line.includes('no_such_rig')));
  const danglingNode: Content = parseContent({ ...shipped, skillTree: [...skillTree, { ...extraNode, requires: ['nothing'] }] });
  assert.ok(contentProblems(danglingNode).some((line: string): boolean => line.includes('nothing')));
});

void test('a tree node needs a known kind and a place of its own', (): void => {
  assert.throws((): Content => parseContent({ ...shipped, skillTree: [...skillTree, { ...extraNode, kind: 'huge' }] }), /kind/);
  const stacked: Content = parseContent({ ...shipped, skillTree: [...skillTree, { ...extraNode, column: skillTree[0]?.column ?? 0, row: skillTree[0]?.row ?? 0 }] });
  assert.ok(contentProblems(stacked).some((line: string): boolean => line.includes('same column and row')));
});

void test('a new skill, monster, item base and tree node are data only', (): void => {
  const content: Content = parseContent(extended());
  assert.deepEqual(contentProblems(content), []);
  const wraith: MonsterDef = must(content.monsters.get('ash_wraith'), 'ash_wraith');
  assert.equal(wraith.skill, 'ember_lash');

  const arena = worldIn(content, 'shallows', 7);
  const spawned = arena.monsters.filter((monster): boolean => monster.def.id === 'ash_wraith');
  assert.equal(spawned.length, 3);
  assert.ok(spawned.every((monster): boolean => monster.life === 45));

  const item = must(generateItem(content, createRng(3), 1, 1, 'obsidian_blade', 'common'), 'item');
  assert.equal(item.base, 'obsidian_blade');

  assert.equal(canAllocate(content, ['eye_of_the_storm'], 1, 'ember_heart'), true);
  assert.equal(canAllocate(content, [], 1, 'ember_heart'), false);
});

void test('held gear is data: a missing attachment or socket is reported', (): void => {
  const geared: RawContent = { ...shipped, skills: [...skills, extraSkill], attachments: [...attachments, extraAttachment], wearables: [...wearables, extraWearable], factions: ashen, monsters: [...monsters, extraMonster] };
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
  const dressed: RawContent = { ...shipped, skills: [...skills, extraSkill], attachments: [...attachments, extraAttachment], wearables: [...wearables, extraWearable], factions: ashen, monsters: [...monsters, extraMonster] };
  const withWear: Content = parseContent(dressed);
  assert.deepEqual(contentProblems(withWear), []);
  assert.deepEqual(must(withWear.monsters.get('ash_wraith'), 'ash_wraith').wear, ['ash_shroud']);
  assert.equal(must(withWear.wearables.get('ash_shroud'), 'ash_shroud').region, 'chest');

  const unknownWearable: Content = parseContent({ ...dressed, wearables });
  assert.ok(contentProblems(unknownWearable).some((found: string): boolean => found.includes('monster ash_wraith wears unknown wearable ash_shroud')));

  const badRegion: RawContent = { ...shipped, wearables: [...wearables, { ...extraWearable, region: 'tail' }] };
  assert.throws((): Content => parseContent(badRegion), (error: unknown): boolean => problem(error, 'region'));

  const doubled: Content = parseContent({ ...dressed, monsters: [...monsters, { ...extraMonster, wear: ['dirty_shirt', 'ash_shroud'] }] });
  assert.ok(contentProblems(doubled).some((found: string): boolean => found.includes('monster ash_wraith wears two pieces on its chest')));

  const hidesNothing: Content = parseContent({ ...shipped, wearables: [...wearables, { ...extraWearable, hides: ['tail'] }] });
  assert.ok(contentProblems(hidesNothing).some((found: string): boolean => found.includes('wearable ash_shroud') && found.includes('no body part tail')));

  const badItem: Content = parseContent({ ...shipped, items: { ...items, bases: [...items.bases, { ...extraBase, id: 'ghost_coat', slot: 'chest', material: 'cloth', visual: null, wear: ['no_such_coat'] }] } });
  assert.ok(contentProblems(badItem).some((found: string): boolean => found.includes('item ghost_coat wears unknown wearable no_such_coat')));

  const lookless: Content = parseContent({ ...shipped, items: { ...items, bases: [...items.bases, { ...extraBase, id: 'plain_coat', slot: 'chest', material: 'cloth', visual: null, wear: [] }] } });
  assert.ok(contentProblems(lookless).some((found: string): boolean => found.includes('item plain_coat has no look')));
  const wrongRegion: Content = parseContent({ ...shipped, items: { ...items, bases: [...items.bases, { ...extraBase, id: 'boot_coat', slot: 'chest', material: 'cloth', visual: null, wear: ['worn_boots'] }] } });
  assert.ok(contentProblems(wrongRegion).some((found: string): boolean => found.includes('item boot_coat in slot chest wears worn_boots, which covers feet')));

  const bareCoat: Content = parseContent({ ...shipped, items: { ...items, bases: [...items.bases, { ...extraBase, id: 'bare_coat', slot: 'chest', visual: null }] } });
  assert.ok(contentProblems(bareCoat).some((found: string): boolean => found.includes('item bare_coat in slot chest needs a material')));
  const plateSword: Content = parseContent({ ...shipped, items: { ...items, bases: [...items.bases, { ...extraBase, material: 'plate' }] } });
  assert.ok(contentProblems(plateSword).some((found: string): boolean => found.includes('item obsidian_blade in slot weapon cannot have a material')));
  const oddCloth: RawContent = { ...shipped, items: { ...items, bases: [...items.bases, { ...extraBase, material: 'silk' }] } };
  assert.throws((): Content => parseContent(oddCloth), (error: unknown): boolean => problem(error, 'material'));
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
  assert.deepEqual(arena.checkpoints, [{ id: 'grate', x: 28, z: 22, radius: 2 }]);
  assert.deepEqual(arena.exits[0], { id: 'east', x: 78.4, z: 30, radius: 1.6, to: 'waystation', toExit: 'west_gate', arrival: { x: 73, z: 30 }, requires: [], lockedHint: '', hiddenWhenLocked: false, look: 'ring' });
  assert.deepEqual(arena.waypoint, null);
  assert.deepEqual(town.waypoint, waystation.waypoint);
  const mist = must(must(content.zones.get('hall_of_time'), 'hall').exits.find((exit): boolean => exit.id === 'mist'), 'mist exit');
  assert.deepEqual(mist.requires, []);
  assert.equal(mist.look, 'mist');
  assert.equal(mist.hiddenWhenLocked, false);
  assert.equal(must(town.props.find((placed): boolean => placed.when.length > 0), 'conditional prop').when.length, 1);
  assert.equal(arena.ambience.background, shallows.ambience.background);
  assert.equal(arena.floors['.'], 'silt');
  assert.deepEqual(arena.outside, shallows.outside);
  assert.deepEqual(town.outside, waystation.outside);
  assert.equal(arena.walls, null);
  assert.equal(content.world.start, 'shallows');
  assert.deepEqual(content.world.scaling, { lifePerLevel: 0.22, damagePerLevel: 0.12, xpPerLevel: 0.15 });
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
    { id: 'ask', type: 'talk', npc: 'warden_guide', text: 'Ask' },
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
  assert.deepEqual(errand.objectives, extraQuest.objectives.map((goal: object): object => ({ ...goal, when: [], sets: {} })));
  const town: ZoneDef = must(content.zones.get('waystation'), 'town');
  const stair = must(town.exits.find((exit): boolean => exit.id === 'west_gate'), 'town stair');
  assert.deepEqual(stair.requires, [{ ...gate, not: false }, { type: 'quest', quest: 'out_of_the_mist', is: 'done', not: true }]);
  assert.equal(stair.lockedHint, 'Later');
  assert.deepEqual(town.waypoint, waystation.waypoint);
  assert.deepEqual(content.world.acts, world.acts.map((entry: object): object => ({ ...entry, end: null })));
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

void test('contentProblems reports dangling quest references', (): void => {
  const [ask, go, kill] = extraQuest.objectives;
  assert.ok(has(addedQuest({ ...extraQuest, requires: ['prologue'] }), 'quest errand requires unknown quest prologue'));
  assert.ok(has(addedQuest({ ...extraQuest, requires: ['errand'] }), 'quest errand requires unknown quest errand'));
  assert.ok(has(addedQuest({ ...extraQuest, objectives: [{ ...ask, npc: 'nobody' }] }), 'quest errand objective ask names unknown npc nobody'));
  assert.ok(has(addedQuest({ ...extraQuest, objectives: [{ ...go, zone: 'atlantis' }] }), 'quest errand objective go names unknown zone atlantis'));
  assert.ok(has(addedQuest({ ...extraQuest, objectives: [{ ...kill, monster: 'dragon' }] }), 'quest errand objective kill names unknown monster dragon'));
  const gated = (requires: unknown): RawContent => ({ ...shipped, zones: zones(townWithGate({ requires, lockedHint: 'No' }), shallows) });
  assert.ok(has(gated([{ type: 'quest', quest: 'prologue', is: 'done' }]), 'zone waystation exit west_gate names unknown quest prologue'));
  assert.ok(has(gated([{ type: 'objective', quest: 'out_of_the_mist', objective: 'dance', is: 'done' }]), 'zone waystation exit west_gate names unknown objective out_of_the_mist.dance'));
  const drawn = (change: Record<string, unknown>): RawContent => ({ ...shipped, world: { ...world, acts: [{ ...act, atlas: { ...act.atlas, ...change } }] } });
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

function bossy(change: (block: Record<string, unknown>) => Record<string, unknown>): RawContent {
  const source = must(monsters.find((entry): boolean => entry.id === 'unfinished_colossus'), 'unfinished_colossus');
  const changed: unknown = { ...source, boss: change({ ...must(source.boss, 'boss block') }) };
  return { ...shipped, monsters: monsters.map((entry): unknown => (entry === source ? changed : entry)) };
}

void test('a boss block parses with its phases, poise, drop and barks, and a pack takes a condition', (): void => {
  const content: Content = parseContent(shipped);
  const boss: BossDef = must(must(content.monsters.get('stormcaller_rival'), 'boss').boss, 'boss block');
  assert.equal(boss.title.length > 0, true);
  assert.deepEqual(boss.phases.map((phase): number => phase.below), [1, 0.5]);
  assert.deepEqual(must(boss.phases[0], 'phase').skills, [
    { skill: 'rival_cleave', weight: 3 },
    { skill: 'rival_bolt', weight: 2 },
  ]);
  assert.deepEqual(must(boss.phases[1], 'phase').barks, []);
  assert.deepEqual(boss.poise, { knockback: 0.2 });
  assert.deepEqual(boss.drop, { items: 1, rarity: 'rare', goldMin: 30, goldMax: 50 });
  assert.deepEqual(boss.barks, { aggro: [], death: [] });
  assert.equal(must(content.monsters.get('mended'), 'thrall').boss, null);
  const during = [{ type: 'quest', quest: 'out_of_the_mist', is: 'done' }];
  const gated: Content = parseContent({ ...shipped, zones: [waystation, { ...shallows, packs: [{ ...shallows.packs[0], when: during }] }] });
  assert.deepEqual(must(must(gated.zones.get('shallows'), 'arena').packs[0], 'pack').when, [{ type: 'quest', quest: 'out_of_the_mist', is: 'done', not: false }]);
  assert.deepEqual(must(must(content.zones.get('shallows'), 'arena').packs[0], 'pack').when, []);
});

void test('a malformed boss block is rejected', (): void => {
  const rejects = (change: (block: Record<string, unknown>) => Record<string, unknown>, text: string): void => {
    assert.throws((): Content => parseContent(bossy(change)), (error: unknown): boolean => problem(error, text), text);
  };
  const phase = { below: 1, skills: [{ skill: 'colossus_hammer', weight: 1 }], barks: [] };
  rejects((block) => ({ ...block, phases: [{ ...phase, below: 0.8 }] }), 'the first phase must start at full life');
  rejects((block) => ({ ...block, phases: [phase, { ...phase, below: 0.5 }, { ...phase, below: 0.5 }] }), 'each phase must begin at a lower life fraction');
  rejects((block) => ({ ...block, phases: [{ ...phase, skills: [] }] }), 'a phase needs at least one skill');
  rejects((block) => ({ ...block, phases: [{ ...phase, skills: [{ skill: 'colossus_hammer', weight: 0 }] }] }), 'skills[0].weight');
  rejects((block) => ({ ...block, phases: [phase, { ...phase, below: 0 }] }), 'phases[1].below');
  rejects((block) => ({ ...block, poise: { knockback: 1.5 } }), 'poise.knockback');
  rejects((block) => ({ ...block, drop: { items: -1, rarity: 'rare', goldMin: 1, goldMax: 2 } }), 'drop.items');
  rejects((block) => ({ ...block, drop: { items: 1.5, rarity: 'rare', goldMin: 1, goldMax: 2 } }), 'drop.items');
  rejects((block) => ({ ...block, drop: { items: 1, rarity: 'rare', goldMin: -4, goldMax: 2 } }), 'drop.goldMin');
  rejects((block) => ({ ...block, drop: { items: 1, rarity: 'rare', goldMin: 50, goldMax: 30 } }), 'drop.goldMax');
  rejects((block) => ({ ...block, barks: { aggro: [] } }), 'barks.death');
  assert.equal(must(parseContent(bossy((block) => ({ ...block, drop: { items: 0, rarity: 'rare', goldMin: 0, goldMax: 0 } }))).monsters.get('unfinished_colossus'), 'unfinished_colossus').boss?.drop.items, 0);
});

void test('contentProblems reports a boss that names an unknown skill, rarity or line, or a line that is not its own', (): void => {
  assert.ok(has(bossy((block) => ({ ...block, phases: [{ below: 1, skills: [{ skill: 'no_such_skill', weight: 1 }], barks: [] }] })), 'boss unfinished_colossus uses unknown skill no_such_skill'));
  assert.ok(has(bossy((block) => ({ ...block, drop: { items: 1, rarity: 'mythic', goldMin: 0, goldMax: 0 } })), 'boss unfinished_colossus drops unknown rarity mythic'));
  assert.ok(has(bossy((block) => ({ ...block, barks: { aggro: ['no_such_line'], death: [] } })), 'boss unfinished_colossus barks unknown line no_such_line'));
  assert.ok(has(bossy((block) => ({ ...block, barks: { aggro: ['unfinished_borrower_said_1'], death: [] } })), 'boss unfinished_colossus barks line unfinished_borrower_said_1, which is spoken by unfinished_borrower'));
  assert.ok(has({ ...shipped, lines: [...lines, { id: 'ghost_1', speaker: 'ghost', text: 'Boo.' }] }, 'line ghost_1 has unknown speaker ghost'));
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

void test('a prop placed with a condition is data only, and one that blocks the way is reported', (): void => {
  const lit = { type: 'objective', quest: 'out_of_the_mist', objective: 'leave', is: 'done' };
  const placed = (prop: string): RawContent => ({ ...shipped, zones: zones({ ...waystation, props: [...waystation.props, { prop, x: 26, z: 30, y: 0, rotationDegrees: 0, when: [lit] }] }, shallows) });
  const content: Content = parseContent(placed('candles'));
  assert.deepEqual(contentProblems(content), []);
  assert.deepEqual(must(content.zones.get('waystation'), 'town').props.at(-1), { prop: 'candles', x: 26, z: 30, y: 0, rotationDegrees: 0, when: [{ ...lit, not: false }] });
  assert.ok(has(placed('castle_pillar'), 'zone waystation places prop castle_pillar with a condition, but it blocks the way'));
  assert.ok(has(placed('no_such_prop'), 'zone waystation places unknown prop no_such_prop'));
});

void test('surfaces parse, and a floor, an outside or a prop dressed in an unknown surface is reported', (): void => {
  const content: Content = parseContent(shipped);
  const cobble = must(content.surfaces.get('cobble'), 'cobble');
  assert.equal(cobble.color, 'textures/cobble_color.webp');
  assert.ok(cobble.metres > 0);
  assert.equal(must(content.props.get('castle_wall_a'), 'wall').surfaces['stone'], 'castle_wall');
  const town = (change: object): RawContent => ({ ...shipped, zones: zones({ ...waystation, ...change }, shallows) });
  assert.ok(has(town({ floors: { ...waystation.floors, '.': 'no_such_surface' } }), 'zone waystation floor uses unknown surface no_such_surface'));
  assert.ok(has(town({ outside: { surface: 'no_such_surface', reach: 2 } }), 'zone waystation outside uses unknown surface no_such_surface'));
  const odd = { id: 'odd_torch', model: 'models/world/torch.glb', scale: 1, blockRadius: 0, light: null, surfaces: { wood: 'no_such_surface' } };
  assert.ok(has({ ...shipped, props: [...propDefs, odd] }, 'prop odd_torch dresses wood in unknown surface no_such_surface'));
  assert.throws((): Content => parseContent({ ...shipped, surfaces: [{ ...cobble, metres: 0 }] }), ContentError);
});

void test('a prop may carry a tint colour, and a malformed one is rejected', (): void => {
  const plain = { id: 'plain_rock', model: 'models/props/rock_set_1.glb', scale: 1, blockRadius: 0, light: null, surfaces: {} };
  const parsed: Content = parseContent({ ...shipped, props: [...propDefs, plain, { ...plain, id: 'dark_rock', tint: '#4a4f58' }] });
  assert.equal(must(parsed.props.get('plain_rock'), 'plain').tint, null);
  assert.equal(must(parsed.props.get('dark_rock'), 'dark').tint, '#4a4f58');
  assert.throws((): Content => parseContent({ ...shipped, props: [...propDefs, { ...plain, tint: 'dark' }] }), /tint/);
});

void test('a prop collider with a length but no radius is rejected, since it would block nothing', (): void => {
  const wall = { id: 'thin_wall', model: 'models/props/rock_set_1.glb', scale: 1, blockRadius: 0, blockLength: 4, light: null, surfaces: {} };
  assert.throws((): Content => parseContent({ ...shipped, props: [...propDefs, wall] }), /needs a radius above zero/);
  assert.throws((): Content => parseContent({ ...shipped, props: [...propDefs, { ...wall, blockRadius: -1, blockLength: 0 }] }), /cannot be negative/);
  const parsed: Content = parseContent({ ...shipped, props: [...propDefs, { ...wall, blockRadius: 0.3 }] });
  assert.equal(must(parsed.props.get('thin_wall'), 'wall').blockLength, 4);
});

void test('a combo is data: its steps parse, and a combo without steps or with a wrong field is rejected', (): void => {
  const step = { animation: 'attack', windup: 0.2, recovery: 0.2, damageScale: 1.5, areaScale: 1.1, knockbackScale: 2, stagger: 0.4, shake: 0.3, hitStop: 0.05 };
  const parsed: Content = parseContent({ ...shipped, skills: [...skills, { ...extraSkill, combo: { window: 0.5, steps: [step] } }] });
  assert.deepEqual(must(parsed.skills.get('ember_lash'), 'skill').combo, { window: 0.5, steps: [step] });
  assert.equal(must(parseContent(extended()).skills.get('ember_lash'), 'skill').combo, null);
  assert.throws((): Content => parseContent({ ...shipped, skills: [...skills, { ...extraSkill, combo: { window: 0.5, steps: [] } }] }), /combo\.steps: a combo needs at least one step/);
  assert.throws((): Content => parseContent({ ...shipped, skills: [...skills, { ...extraSkill, combo: { window: 0, steps: [step] } }] }), /combo\.window/);
  assert.throws((): Content => parseContent({ ...shipped, skills: [...skills, { ...extraSkill, combo: { window: 0.5, steps: [{ ...step, damageScale: 'big' }] } }] }), /steps\[0\]\.damageScale/);
});

void test('a rig may name unarmed clips for when it holds nothing, and they are checked like its other actions', (): void => {
  const [first] = rigs;
  const rig = must(first, 'first rig');
  const parsed: Content = parseContent(shipped);
  const hero = must(parsed.rigs.get(parsed.player.rig), 'hero rig');
  const bare = must(hero.clips.unarmed, 'hero unarmed clips');
  assert.ok(must(bare.actions['attack'], 'unarmed attack').impactFraction > 0);
  const plain: Content = parseContent({ ...shipped, rigs: [{ ...rig, clips: { ...rig.clips, unarmed: null } }] });
  assert.equal(must(plain.rigs.get(rig.id), 'plain rig').clips.unarmed, null);
  const late = { idle: 'Idle_Loop', actions: { attack: { clip: 'Punch_Jab', impactFraction: 1 } } };
  assert.throws((): Content => parseContent({ ...shipped, rigs: [{ ...rig, clips: { ...rig.clips, unarmed: late } }] }), /unarmed\.actions\.attack\.impactFraction/);
});

void test('a rig lists its hit and death clips and names its action clips, and a skill whose clip the rig lacks is reported', (): void => {
  const [first] = rigs;
  const rig = must(first, 'first rig');
  const parsed: Content = parseContent(shipped);
  const hero = must(parsed.rigs.get(parsed.player.rig), 'hero rig');
  assert.ok(hero.clips.death.length >= 2);
  assert.ok(hero.gaits.length >= 2 && hero.gaits.every((gait): boolean => gait.groundSpeed > 0));
  assert.ok(must(hero.clips.actions['attack'], 'attack clip').impactFraction > 0);
  assert.throws((): Content => parseContent({ ...shipped, rigs: [{ ...rig, clips: { ...rig.clips, death: [] } }] }), /clips\.death: a rig needs at least one death clip/);
  assert.throws((): Content => parseContent({ ...shipped, rigs: [{ ...rig, clips: { ...rig.clips, hit: [] } }] }), /clips\.hit: a rig needs at least one hit clip/);
  assert.throws((): Content => parseContent({ ...shipped, rigs: [{ ...rig, clips: { ...rig.clips, actions: { attack: { clip: 'Sword_Attack', impactFraction: 1 } } } }] }), /impactFraction/);
  assert.throws((): Content => parseContent({ ...shipped, rigs: [{ ...rig, gaits: [{ clip: 'Walk_Loop', groundSpeed: 0 }] }] }), /groundSpeed/);
  assert.throws((): Content => parseContent({ ...shipped, rigs: [{ ...rig, gaits: [] }] }), /gaits: a rig needs at least one gait/);
  assert.throws((): Content => parseContent({ ...shipped, rigs: [{ ...rig, gaits: [{ clip: 'Jog_Fwd_Loop', groundSpeed: 7 }, { clip: 'Walk_Loop', groundSpeed: 1 }] }] }), /gaits run from the slowest to the fastest/);
  const lost: string[] = contentProblems(parseContent({ ...shipped, skills: [...skills, { ...extraSkill, animation: 'pirouette' }], monsters: [...monsters, { ...extraMonster, gear: [], wear: [] }] }));
  assert.ok(lost.includes('monster ash_wraith uses skill ember_lash, but rig human_man has no action clip pirouette'));
  const step = { animation: 'backflip', windup: 0.2, recovery: 0.2, damageScale: 1, areaScale: 1, knockbackScale: 1, stagger: 0, shake: 0, hitStop: 0 };
  const cleave: unknown = skills.find((entry: { readonly id: string }): boolean => entry.id === 'cleave');
  const rest: unknown[] = skills.filter((entry: { readonly id: string }): boolean => entry.id !== 'cleave');
  const chained: string[] = contentProblems(parseContent({ ...shipped, skills: [...rest, Object.assign({}, cleave, { combo: { window: 0.5, steps: [step] } })] }));
  assert.ok(chained.includes('skill book uses skill cleave, but rig hero_man has no action clip backflip'));
});

function voidWith(change: Readonly<Record<string, unknown>>): RawContent {
  const changed: unknown = { ...between, ...change };
  return { ...shipped, zones: shipped.zones.map((zone: unknown): unknown => (zone === between ? changed : zone)) };
}

void test('a void recentres around the hero, so it cannot hold npcs, checkpoints or a waypoint', (): void => {
  const checkpoint = { id: 'stone', x: 80, z: 80, radius: 2 };
  assert.throws((): unknown => parseContent(voidWith({ checkpoints: [checkpoint] })), (error: unknown): boolean => problem(error, 'cannot hold npcs, checkpoints or props'));
  assert.throws((): unknown => parseContent(voidWith({ props: [{ prop: 'castle_pier', x: 80, z: 80 }] })), (error: unknown): boolean => problem(error, 'or props'));
  assert.throws((): unknown => parseContent(voidWith({ waypoint: { x: 80, z: 80 } })), (error: unknown): boolean => problem(error, 'cannot hold a waypoint'));
  assert.doesNotThrow((): unknown => parseContent(voidWith({})));
});

void test('a skill effect with no cue or light gets no cue and full light, and a negative light is rejected', (): void => {
  const plain: Content = parseContent({ ...shipped, skills: [...skills, extraSkill] });
  assert.deepEqual(must(plain.skills.get('ember_lash'), 'skill').vfx, { style: 'slash', color: '#ff8844', cue: 'none', light: 1 });
  const blinding: RawContent = { ...shipped, skills: [{ ...extraSkill, vfx: { style: 'slash', color: '#ff8844', light: -1 } }] };
  assert.throws((): Content => parseContent(blinding), (error: unknown): boolean => problem(error, 'skills[0].vfx'));
});

void test('a skill hits for physical damage unless its data names storm or frost, and an unknown type is refused', (): void => {
  const content: Content = parseContent(shipped);
  assert.equal(must(content.skills.get('cleave'), 'cleave').damage.type, 'physical');
  assert.equal(must(content.skills.get('rival_bolt'), 'rival_bolt').damage.type, 'storm');
  assert.equal(must(content.skills.get('still_grasp'), 'still_grasp').damage.type, 'frost');
  const first = must(skills[0], 'skill');
  const broken: RawContent = { ...shipped, skills: [{ ...first, damage: { ...first.damage, type: 'hush' } }] };
  assert.throws((): Content => parseContent(broken), (error: unknown): boolean => problem(error, 'skills[0].damage.type'));
});

void test('a zone with no storm tier is tier 0, and the hero resists up to a cap from data', (): void => {
  const content: Content = parseContent(shipped);
  assert.ok([...content.zones.values()].every((zone): boolean => zone.stormTier === 0));
  assert.deepEqual(content.player.resistance, { armourCap: 0.75, cap: 0.75, floor: -1, tierPenalty: 0.2 });
  const broken: RawContent = { ...shipped, player: { ...player, resistance: { armourCap: 0.75, cap: 0.75, floor: 0.5, tierPenalty: 0.2 } } };
  assert.throws((): Content => parseContent(broken), (error: unknown): boolean => problem(error, 'player.resistance.floor'));
});
